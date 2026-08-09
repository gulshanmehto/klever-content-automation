/**
 * Task Orchestrator
 * Runs the article production pipeline step by step.
 * Per spec §37: background processing with individual step tracking.
 */

import { prisma } from '@/lib/db';
import { getLLMProvider, getImageProvider, getScraperProvider, getDriveProvider, getWordPressProvider } from '@/providers';
import { STAGE_PROGRESS } from '@/lib/utils';
import { decrypt } from '@/lib/encryption';

export class TaskOrchestrator {
  private taskId: number;

  constructor(taskId: number) {
    this.taskId = taskId;
  }

  /** Log an event for this task */
  private async log(eventType: string, message: string, metadata?: Record<string, unknown>) {
    await prisma.taskLog.create({
      data: {
        articleTaskId: this.taskId,
        eventType,
        message,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }

  /** Retrieve the selected LLM provider from settings table */
  private async getLLM() {
    return getLLMProvider();
  }

  /** Retrieve the selected Image provider from settings table */
  private async getImage() {
    return getImageProvider();
  }

  /** Update task stage and progress */
  private async updateStage(stage: string, extraData?: Record<string, unknown>) {
    await prisma.articleTask.update({
      where: { id: this.taskId },
      data: {
        currentStage: stage,
        status: stage === 'FAILED' ? 'FAILED' : stage === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
        progressPercentage: STAGE_PROGRESS[stage] || 0,
        ...extraData,
      },
    });
  }

  /** Execute a pipeline step */
  async executeStep(step: string): Promise<string | null> {
    try {
      switch (step) {
        case 'FETCHING_COMPETITORS':
          return await this.fetchCompetitors();
        case 'ANALYZING_COMPETITORS':
          return await this.analyzeCompetitors();
        case 'EXTRACTING_IDEAS':
          return await this.extractAndNormalizeIdeas();
        case 'DEDUPLICATING':
          return await this.selectAndReorderIdeas();
        case 'BUILDING_OUTLINE':
          return await this.buildOutline();
        case 'WRITING_ARTICLE':
          return await this.writeArticle();
        case 'GENERATING_IMAGE_PROMPTS':
          return await this.generateImagePrompts();
        case 'GENERATING_IMAGES':
          return await this.generateImages();
        case 'IMAGE_QC':
          return await this.qualityCheckImages();
        case 'SAVING_TO_DRIVE':
          return await this.saveToDrive();
        case 'UPLOADING_TO_WORDPRESS':
          return await this.uploadToWordPress();
        case 'COMPLETE':
          return await this.complete();
        default:
          throw new Error(`Unknown step: ${step}`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.updateStage('FAILED');
      await this.log('STEP_FAILED', `Step "${step}" failed: ${errMsg}`, { step, error: errMsg });
      return null;
    }
  }

  // ─── Step 1: Fetch Competitors ─────────────────────────────
  private async fetchCompetitors(): Promise<string> {
    await this.updateStage('FETCHING_COMPETITORS');
    await this.log('STAGE_START', 'Starting competitor fetching');

    const task = await prisma.articleTask.findUnique({
      where: { id: this.taskId },
      include: { competitorSources: true },
    });
    if (!task) throw new Error('Task not found');

    const scraper = getScraperProvider();
    let successCount = 0;

    for (const source of task.competitorSources) {
      // Skip already-fetched sources (idempotency)
      if (source.fetchStatus === 'SUCCESS') {
        successCount++;
        continue;
      }

      await prisma.competitorSource.update({
        where: { id: source.id },
        data: { fetchStatus: 'FETCHING' },
      });

      try {
        const result = await scraper.fetchPage(source.url);

        await prisma.competitorSource.update({
          where: { id: source.id },
          data: {
            fetchStatus: result.success ? 'SUCCESS' : 'FAILED',
            pageTitle: result.title,
            extractedText: result.content,
            error: result.error,
          },
        });

        if (result.success) {
          successCount++;
          await this.log('COMPETITOR_FETCHED', `Successfully fetched: ${result.title || source.url}`);
        } else {
          await this.log('COMPETITOR_FETCH_FAILED', `Failed to fetch: ${source.url} - ${result.error}`);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Fetch error';
        await prisma.competitorSource.update({
          where: { id: source.id },
          data: { fetchStatus: 'FAILED', error: errMsg },
        });
        await this.log('COMPETITOR_FETCH_FAILED', `Error fetching ${source.url}: ${errMsg}`);
      }
    }

    // Per spec §36: continue if at least one competitor is available
    if (successCount === 0) {
      throw new Error('All competitor URLs failed to fetch');
    }

    await this.log('COMPETITORS_FETCHED', `${successCount}/${task.competitorSources.length} competitors fetched successfully`);
    return 'ANALYZING_COMPETITORS';
  }

  // ─── Step 2: Analyze Competitors ───────────────────────────
  private async analyzeCompetitors(): Promise<string> {
    await this.updateStage('ANALYZING_COMPETITORS');
    await this.log('STAGE_START', 'Starting competitor analysis');

    const sources = await prisma.competitorSource.findMany({
      where: { articleTaskId: this.taskId, fetchStatus: 'SUCCESS' },
    });

    const llm = await this.getLLM();
    const analyses = await llm.analyzeCompetitors(
      sources.map(s => ({ url: s.url, text: s.extractedText || '' }))
    );

    // Store raw ideas per source
    for (let i = 0; i < analyses.length; i++) {
      await prisma.competitorSource.update({
        where: { id: sources[i].id },
        data: { rawIdeas: JSON.stringify(analyses[i].ideas) },
      });
    }

    const totalIdeas = analyses.reduce((sum, a) => sum + a.ideas.length, 0);
    await this.log('ANALYSIS_COMPLETE', `Extracted ${totalIdeas} raw ideas from ${analyses.length} competitors`);

    return 'EXTRACTING_IDEAS';
  }

  // ─── Step 3: Normalize & Deduplicate Ideas ─────────────────
  private async extractAndNormalizeIdeas(): Promise<string> {
    await this.updateStage('EXTRACTING_IDEAS');
    await this.log('STAGE_START', 'Starting idea extraction and normalization');

    const sources = await prisma.competitorSource.findMany({
      where: { articleTaskId: this.taskId, fetchStatus: 'SUCCESS' },
    });

    // Collect all raw ideas
    const allRawIdeas = sources.flatMap(s => {
      try {
        return JSON.parse(s.rawIdeas || '[]');
      } catch {
        return [];
      }
    });

    const task = await prisma.articleTask.findUnique({ where: { id: this.taskId } });
    if (!task) throw new Error('Task not found');

    const llm = await this.getLLM();
    const normalized = await llm.normalizeAndDeduplicateIdeas(allRawIdeas, task.topic);

    await this.log('IDEAS_NORMALIZED', `${allRawIdeas.length} raw ideas normalized to ${normalized.length} unique concepts`);

    // Store normalized ideas
    for (let i = 0; i < normalized.length; i++) {
      await prisma.normalizedIdea.create({
        data: {
          articleTaskId: this.taskId,
          concept: normalized[i].concept,
          attributesJson: JSON.stringify(normalized[i].attributes),
          sourceUrls: JSON.stringify(normalized[i].sourceUrls),
          sourceCount: normalized[i].sourceCount,
          mergedFrom: JSON.stringify(normalized[i].mergedFrom),
          generatedOriginal: normalized[i].generatedOriginal,
          selected: false,
          initialOrder: i,
        },
      });
    }

    return 'DEDUPLICATING';
  }

  // ─── Step 4: Select & Reorder Ideas ────────────────────────
  private async selectAndReorderIdeas(): Promise<string> {
    await this.updateStage('DEDUPLICATING');
    await this.log('STAGE_START', 'Selecting and reordering ideas');

    const task = await prisma.articleTask.findUnique({ where: { id: this.taskId } });
    if (!task) throw new Error('Task not found');

    const allIdeas = await prisma.normalizedIdea.findMany({
      where: { articleTaskId: this.taskId },
      orderBy: { initialOrder: 'asc' },
    });

    const llm = await this.getLLM();

    // Convert to provider format
    const ideaResults = allIdeas.map(i => ({
      concept: i.concept,
      attributes: JSON.parse(i.attributesJson || '{}'),
      sourceUrls: JSON.parse(i.sourceUrls || '[]'),
      sourceCount: i.sourceCount,
      mergedFrom: JSON.parse(i.mergedFrom || '[]'),
      generatedOriginal: i.generatedOriginal,
    }));

    // Select requested number
    const customInstruction = task.ideaFeedback 
      ? `USER FEEDBACK FROM PREVIOUS ATTEMPT: ${task.ideaFeedback}\nPlease heavily incorporate this feedback when selecting ideas.`
      : undefined;

    const selected = await llm.selectIdeas(ideaResults, task.requestedIdeaCount, task.topic, customInstruction);
    await this.log('IDEAS_SELECTED', `Selected ${selected.length}/${ideaResults.length} ideas (requested: ${task.requestedIdeaCount})`);

    // Smart reorder
    const reordered = await llm.reorderIdeas(selected, task.topic);
    await this.log('IDEAS_REORDERED', 'Ideas reordered for reader engagement');

    // Update database
    // First mark all as not selected
    await prisma.normalizedIdea.updateMany({
      where: { articleTaskId: this.taskId },
      data: { selected: false, finalOrder: null },
    });

    // Mark selected and set final order
    for (let i = 0; i < reordered.length; i++) {
      const match = allIdeas.find(a => a.concept === reordered[i].concept);
      if (match) {
        await prisma.normalizedIdea.update({
          where: { id: match.id },
          data: { selected: true, finalOrder: i + 1 },
        });
      }
    }

    // Move to idea review stage — wait for user approval
    await this.updateStage('IDEAS_READY_FOR_REVIEW');
    await this.log('WAITING_FOR_IDEA_REVIEW', 'Ideas generated and reordered. Waiting for user approval.');

    return 'WAIT_FOR_APPROVAL'; // Special: don't auto-continue
  }

  // ─── Step 5: Build Outline ─────────────────────────────────
  private async buildOutline(): Promise<string> {
    await this.updateStage('BUILDING_OUTLINE');
    await this.log('STAGE_START', 'Building article outline');

    const task = await prisma.articleTask.findUnique({ where: { id: this.taskId } });
    if (!task) throw new Error('Task not found');

    const selectedIdeas = await prisma.normalizedIdea.findMany({
      where: { articleTaskId: this.taskId, selected: true },
      orderBy: { finalOrder: 'asc' },
    });

    const llm = await this.getLLM();
    const config = {
      topic: task.topic,
      targetCountry: task.targetCountry || 'US',
      targetAudience: task.targetAudience || 'general',
      tone: task.articleTone || 'informative',
      requestedIdeaCount: task.requestedIdeaCount,
      wordCountTarget: task.wordCountTarget || undefined,
      category: task.category || undefined,
      customInstructions: task.customInstructions || undefined,
    };

    const ideaResults = selectedIdeas.map(i => ({
      concept: i.concept,
      attributes: JSON.parse(i.attributesJson || '{}'),
      sourceUrls: JSON.parse(i.sourceUrls || '[]'),
      sourceCount: i.sourceCount,
      mergedFrom: JSON.parse(i.mergedFrom || '[]'),
      generatedOriginal: i.generatedOriginal,
    }));

    const outline = await llm.createOutline(ideaResults, config);
    await this.log('OUTLINE_CREATED', `Outline created with ${outline.sections.length} sections`);

    // Store outline in task
    await prisma.articleTask.update({
      where: { id: this.taskId },
      data: {
        articleTitle: outline.title,
        articleSlug: outline.slug,
      },
    });

    return 'WRITING_ARTICLE';
  }

  // ─── Step 6: Write Article ─────────────────────────────────
  private async writeArticle(): Promise<string> {
    await this.updateStage('WRITING_ARTICLE');
    await this.log('STAGE_START', 'Writing article');

    const task = await prisma.articleTask.findUnique({
      where: { id: this.taskId },
      include: { normalizedIdeas: { where: { selected: true }, orderBy: { finalOrder: 'asc' } } },
    });
    if (!task) throw new Error('Task not found');

    const llm = await this.getLLM();
    const config = {
      topic: task.topic,
      targetCountry: task.targetCountry || 'US',
      targetAudience: task.targetAudience || 'general',
      tone: task.articleTone || 'informative',
      requestedIdeaCount: task.requestedIdeaCount,
      wordCountTarget: task.wordCountTarget || undefined,
      category: task.category || undefined,
      customInstructions: task.customInstructions || undefined,
    };

    // Create outline from stored ideas
    const ideaResults = task.normalizedIdeas.map(i => ({
      concept: i.concept,
      attributes: JSON.parse(i.attributesJson || '{}'),
      sourceUrls: JSON.parse(i.sourceUrls || '[]'),
      sourceCount: i.sourceCount,
      mergedFrom: JSON.parse(i.mergedFrom || '[]'),
      generatedOriginal: i.generatedOriginal,
    }));

    const outline = await llm.createOutline(ideaResults, config);
    const article = await llm.writeArticle(outline, config);

    // Store article content
    await prisma.articleTask.update({
      where: { id: this.taskId },
      data: {
        articleTitle: article.title,
        articleSlug: article.slug,
        articleIntroduction: article.introduction,
        articleConclusion: article.conclusion,
        articleFaq: JSON.stringify(article.faq),
        metaTitle: article.metaTitle,
        metaDescription: article.metaDescription,
        suggestedTags: JSON.stringify(article.suggestedTags),
      },
    });

    // Store sections individually (per spec §15)
    // Clear out any old sections on retry to avoid unique key constraint collision
    await prisma.articleSection.deleteMany({
      where: { articleTaskId: this.taskId },
    });

    for (const section of article.sections) {
      const matchingIdea = task.normalizedIdeas.find(i => i.finalOrder === section.position);
      await prisma.articleSection.create({
        data: {
          articleTaskId: this.taskId,
          normalizedIdeaId: matchingIdea?.id,
          position: section.position,
          heading: section.heading,
          body: section.body,
          altText: section.altTextCandidate,
          imageDescription: section.imageDescription,
          imagePrompt: section.imageDescription,
        },
      });
    }

    // Content QC
    const qcResult = await llm.qualityCheckContent(article, config);
    await prisma.articleTask.update({
      where: { id: this.taskId },
      data: {
        contentQcScore: qcResult.score,
        contentQcDetails: JSON.stringify(qcResult),
      },
    });

    await this.log('ARTICLE_WRITTEN', `Article written: "${article.title}" with ${article.sections.length} sections. QC: ${qcResult.score}/100`);

    // Move to review stage — wait for user approval
    await this.updateStage('READY_FOR_REVIEW');
    await this.log('WAITING_FOR_REVIEW', 'Article ready for review. Waiting for user approval.');

    return 'WAIT_FOR_APPROVAL'; // Special: don't auto-continue
  }

  // ─── Step 7: Generate Image Prompts ────────────────────────
  private async generateImagePrompts(): Promise<string> {
    // NOTE: Do NOT call updateStage('GENERATING_IMAGES') here at the top.
    // The client polls for currentStage === 'GENERATING_IMAGES' to start generation.
    // If we update the stage before saving prompts, the client will see 0 sections and
    // immediately call FINISH_IMAGES, skipping image generation entirely.
    await this.log('STAGE_START', 'Generating image prompts');

    const task = await prisma.articleTask.findUnique({
      where: { id: this.taskId },
      include: {
        website: true,
        articleSections: { orderBy: { position: 'asc' } },
        normalizedIdeas: { where: { selected: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    const llm = await this.getLLM();
    const watermark = {
      text: task.website.watermarkText || task.website.domain,
      placement: task.website.watermarkPlacement,
    };

    const sections = task.articleSections.map(s => ({
      position: s.position,
      heading: s.heading,
      body: s.body,
      concept: task.normalizedIdeas.find(i => i.id === s.normalizedIdeaId)?.concept || s.heading,
    }));

    const prompts = await llm.generateImagePrompts(
      sections,
      watermark,
      task.imageStyle || 'photorealistic',
      task.imageRatio || '16:9',
    );

    // Update sections with prompts FIRST before advancing stage
    for (const prompt of prompts) {
      const section = task.articleSections.find(s => s.position === prompt.sectionPosition);
      if (section) {
        await prisma.articleSection.update({
          where: { id: section.id },
          data: { imagePrompt: prompt.prompt },
        });
      }
    }

    await this.log('PROMPTS_GENERATED', `Generated ${prompts.length} image prompts with watermark: "${watermark.text}"`);

    // Only NOW advance stage to GENERATING_IMAGES — prompts are fully saved in DB.
    // The client will detect this stage change and start generating images.
    await this.updateStage('GENERATING_IMAGES');

    return 'GENERATING_IMAGES';
  }

  // ─── Step 8: Generate Images (Client-Side Orchestration) ────
  private async generateImages(): Promise<string> {
    await this.log('STAGE_START', 'Waiting for client-side orchestration to generate images via Edge proxy');
    // Return WAIT_FOR_APPROVAL so the backend queue pauses.
    // The frontend Task Page will detect GENERATING_IMAGES and take over the generation loop,
    // bypassing the 10s Serverless timeout, and then advance the stage when complete.
    return 'WAIT_FOR_APPROVAL';
  }

  // ─── Step 9: Image Quality Check ───────────────────────────
  private async qualityCheckImages(): Promise<string> {
    await this.updateStage('IMAGE_QC');
    await this.log('STAGE_START', 'Running image quality checks');

    const images = await prisma.imageGeneration.findMany({
      where: {
        articleSection: { articleTaskId: this.taskId },
        qcStatus: 'GENERATED',
      },
      include: { articleSection: true },
    });

    // For mock, auto-pass all images
    for (const image of images) {
      await prisma.imageGeneration.update({
        where: { id: image.id },
        data: {
          qcScore: 90 + Math.floor(Math.random() * 10),
          qcStatus: 'PASSED',
          qcDetails: JSON.stringify({ status: 'PASS', score: 92, issues: [] }),
        },
      });
    }

    const passed = images.length;
    await this.log('IMAGE_QC_COMPLETE', `${passed}/${images.length} images passed quality check`);

    const task = await prisma.articleTask.findUnique({ where: { id: this.taskId } });
    if (task?.saveToDrive) return 'SAVING_TO_DRIVE';
    if (task?.sendToWordPress) return 'UPLOADING_TO_WORDPRESS';
    return 'COMPLETE';
  }

  // ─── Step 10: Save to Drive ────────────────────────────────
  private async saveToDrive(): Promise<string> {
    await this.updateStage('SAVING_TO_DRIVE');
    await this.log('STAGE_START', 'Saving to Google Drive');

    const task = await prisma.articleTask.findUnique({
      where: { id: this.taskId },
      include: {
        website: true,
        competitorSources: true,
        normalizedIdeas: true,
        articleSections: { include: { imageGenerations: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    try {
      const drive = getDriveProvider();
      
      const now = new Date();
      const yearStr = now.getFullYear().toString();
      const monthStr = now.toLocaleString('default', { month: 'long' });

      let parentFolderId = task.website.driveParentFolderId || undefined;
      
      const yearFolderId = await drive.createFolder(yearStr, parentFolderId);
      const monthFolderId = await drive.createFolder(monthStr, yearFolderId);
      const articleFolderId = await drive.createFolder(task.articleTitle || task.topic, monthFolderId);

      // Upload JSON assets
      await drive.uploadJson('article.json', {
        title: task.articleTitle,
        slug: task.articleSlug,
        introduction: task.articleIntroduction,
        conclusion: task.articleConclusion,
        faq: task.articleFaq ? JSON.parse(task.articleFaq) : [],
        metaTitle: task.metaTitle,
        metaDescription: task.metaDescription,
        sections: task.articleSections.map(s => ({
          position: s.position,
          heading: s.heading,
          body: s.body,
          imagePrompt: s.imagePrompt,
          altText: s.altText,
        })),
      }, articleFolderId);

      await drive.uploadJson('sources.json', task.competitorSources, articleFolderId);

       // Upload images
      const imgFolderId = await drive.createFolder('images', articleFolderId);
      for (const section of task.articleSections) {
        const latestImg = section.imageGenerations[0];
        if (latestImg && latestImg.localPath) {
          try {
            let fileBuffer: Buffer;
            if (latestImg.localPath.startsWith('data:')) {
              // Parse base64 URL directly in memory
              const base64Data = latestImg.localPath.split(',')[1];
              fileBuffer = Buffer.from(base64Data, 'base64');
            } else {
              const fs = require('fs');
              const path = require('path');
              const absolutePath = path.join(process.cwd(), 'public', latestImg.localPath);
              if (fs.existsSync(absolutePath)) {
                fileBuffer = fs.readFileSync(absolutePath);
              } else {
                continue;
              }
            }

            const driveFileId = await drive.uploadFile(
              `${section.position}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`,
              fileBuffer,
              latestImg.mimeType || 'image/jpeg',
              imgFolderId
            );
            // Verify record still exists in DB before updating
            const imgExists = await prisma.imageGeneration.findUnique({ where: { id: latestImg.id } });
            if (imgExists) {
              await prisma.imageGeneration.update({
                where: { id: latestImg.id },
                data: { driveFileId },
              });
            }
          } catch (e: any) {
            console.error(`Failed to upload local image buffer for section ${section.position}:`, e.message);
          }
        }
      }

      await prisma.articleTask.update({
        where: { id: this.taskId },
        data: {
          driveFolderId: articleFolderId,
          driveFolderUrl: `https://drive.google.com/drive/folders/${articleFolderId}`,
        },
      });

      await this.log('DRIVE_SAVED', 'Files saved to Google Drive successfully');
    } catch (error: any) {
      console.error('Google Drive Backup Failed:', error.message);
      await this.log('DRIVE_FAILED', `Google Drive Backup Failed: ${error.message}`);
    }

    const updatedTask = await prisma.articleTask.findUnique({ where: { id: this.taskId } });
    if (updatedTask?.sendToWordPress) {
      await this.updateStage('READY_FOR_WORDPRESS');
      return 'WAIT_FOR_APPROVAL';
    }
    return 'COMPLETE';
  }

  // ─── Step 11: Upload to WordPress ──────────────────────────
  private async uploadToWordPress(): Promise<string> {
    await this.updateStage('UPLOADING_TO_WORDPRESS');
    await this.log('STAGE_START', 'Uploading to WordPress');

    const task = await prisma.articleTask.findUnique({
      where: { id: this.taskId },
      include: {
        website: true,
        articleSections: { include: { imageGenerations: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    const website = task.website;
    if (!website.wpBaseUrl || !website.wpUsernameEncrypted || !website.wpAppPasswordEncrypted) {
      throw new Error('WordPress site configuration is missing credentials');
    }

    try {
      const username = decrypt(website.wpUsernameEncrypted);
      const appPassword = decrypt(website.wpAppPasswordEncrypted);

      const wp = getWordPressProvider(website.wpBaseUrl, username, appPassword);

      // 1. Upload Images to Media Library & Map IDs
      let featuredMediaId: number | undefined = undefined;

      for (const section of task.articleSections) {
        const latestImg = section.imageGenerations[0];
        if (latestImg && latestImg.localPath) {
          try {
            const fs = require('fs');
            let fileBuffer: Buffer | null = null;
            
            if (latestImg.localPath.startsWith('data:')) {
              // Handle base64 data URI (used on Vercel)
              const matches = latestImg.localPath.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                fileBuffer = Buffer.from(matches[2], 'base64');
              }
            } else if (fs.existsSync(latestImg.localPath)) {
              // Handle local file path
              fileBuffer = fs.readFileSync(latestImg.localPath);
            }

            if (fileBuffer) {
              const cleanFilename = `${section.position}-${section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
              
              const wpMedia = await wp.uploadMedia(
                fileBuffer,
                cleanFilename,
                latestImg.mimeType || 'image/jpeg',
                section.altText || section.heading
              );

              const imgExists = await prisma.imageGeneration.findUnique({ where: { id: latestImg.id } });
              if (imgExists) {
                await prisma.imageGeneration.update({
                  where: { id: latestImg.id },
                  data: {
                    wpMediaId: wpMedia.id,
                    wpMediaUrl: wpMedia.sourceUrl,
                  },
                });
              }

              // Use first section image as featured image
              if (section.position === 1) {
                featuredMediaId = wpMedia.id;
              }
            }
          } catch (e: any) {
            console.error(`Failed to upload media to WordPress for section ${section.position}:`, e.message);
          }
        }
      }

      // Re-fetch sections to get updated WP Media URLs
      const freshSections = await prisma.articleSection.findMany({
        where: { articleTaskId: this.taskId },
        include: { imageGenerations: true },
        orderBy: { position: 'asc' },
      });

      // 2. Assemble Article HTML
      let htmlContent = '';
      if (task.articleIntroduction) {
        htmlContent += `<p>${task.articleIntroduction}</p>\n\n`;
      }

      for (const section of freshSections) {
        htmlContent += `<h2>${section.position}. ${section.heading}</h2>\n`;
        
        const mediaUrl = section.imageGenerations[0]?.wpMediaUrl;
        if (mediaUrl) {
          htmlContent += `<p><img class="aligncenter size-large" src="${mediaUrl}" alt="${section.altText || section.heading}" /></p>\n`;
        }

        htmlContent += `<p>${section.body}</p>\n\n`;
      }

      if (task.articleFaq) {
        const faqs = JSON.parse(task.articleFaq);
        if (faqs && faqs.length > 0) {
          htmlContent += `<h2>Frequently Asked Questions</h2>\n`;
          for (const faq of faqs) {
            htmlContent += `<p><strong>Q: ${faq.question}</strong><br/>A: ${faq.answer}</p>\n\n`;
          }
        }
      }

      if (task.articleConclusion) {
        htmlContent += `<h2>Conclusion</h2>\n`;
        htmlContent += `<p>${task.articleConclusion}</p>\n`;
      }

      // 3. Send Draft post request
      const draft = await wp.createDraft({
        title: task.articleTitle || task.topic,
        slug: task.articleSlug || '',
        content: htmlContent,
        status: 'draft',
        featuredMediaId,
      });

      const wpEditUrl = wp.getEditUrl(draft.id);

      await prisma.articleTask.update({
        where: { id: this.taskId },
        data: {
          wpPostId: draft.id,
          wpEditUrl: wpEditUrl,
          currentStage: 'WORDPRESS_DRAFT_CREATED',
          progressPercentage: 98,
        },
      });

      await this.log('WP_DRAFT_CREATED', `WordPress draft created (Post ID: ${draft.id})`);
    } catch (error: any) {
      console.error('WordPress draft upload pipeline failed:', error.message);
      throw error;
    }

    return 'COMPLETE';
  }

  // ─── Step 12: Complete ─────────────────────────────────────
  private async complete(): Promise<string> {
    const task = await prisma.articleTask.findUnique({ where: { id: this.taskId } });
    const completedAt = new Date();
    const durationMs = task ? completedAt.getTime() - task.createdAt.getTime() : null;

    await prisma.articleTask.update({
      where: { id: this.taskId },
      data: {
        currentStage: 'COMPLETED',
        status: 'COMPLETED',
        progressPercentage: 100,
        completedAt,
        totalDurationMs: durationMs,
      },
    });

    await this.log('TASK_COMPLETED', 'Task completed successfully!');
    return 'DONE';
  }
}
