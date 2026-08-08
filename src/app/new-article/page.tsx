'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus2, Loader, Globe } from 'lucide-react';

interface Website {
  id: string;
  name: string;
  domain: string;
  targetCountry: string;
  targetAudience: string;
  defaultTone: string;
  defaultCategory: string | null;
  defaultImageStyle: string;
  defaultImageRatio: string;
}

export default function NewArticlePage() {
  const router = useRouter();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [websiteId, setWebsiteId] = useState('');
  const [topic, setTopic] = useState('');
  const [requestedIdeaCount, setRequestedIdeaCount] = useState(10);
  const [competitorUrl1, setCompetitorUrl1] = useState('');
  const [competitorUrl2, setCompetitorUrl2] = useState('');
  const [competitorUrl3, setCompetitorUrl3] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [articleTone, setArticleTone] = useState('');
  const [category, setCategory] = useState('');
  const [wordCountTarget, setWordCountTarget] = useState<number | ''>('');
  const [imageRatio, setImageRatio] = useState('');
  const [imageStyle, setImageStyle] = useState('');

  // Checkboxes
  const [generateImages, setGenerateImages] = useState(true);
  const [saveToDrive, setSaveToDrive] = useState(true);
  const [sendToWordPress, setSendToWordPress] = useState(true);
  const [autoRegenerateImages, setAutoRegenerateImages] = useState(true);

  useEffect(() => {
    async function fetchWebsites() {
      try {
        const res = await fetch('/api/websites');
        const data = await res.json();
        setWebsites(data.websites || []);
        if (data.websites?.length === 1) {
          setWebsiteId(data.websites[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch websites:', err);
      }
    }
    fetchWebsites();
  }, []);

  // Auto-fill defaults when website changes
  useEffect(() => {
    const website = websites.find((w) => w.id === websiteId);
    if (website) {
      setTargetCountry(website.targetCountry);
      setTargetAudience(website.targetAudience);
      setArticleTone(website.defaultTone);
      setCategory(website.defaultCategory || '');
      setImageStyle(website.defaultImageStyle);
      setImageRatio(website.defaultImageRatio);
    }
  }, [websiteId, websites]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const competitorUrls = [competitorUrl1, competitorUrl2, competitorUrl3].filter(Boolean);

    if (competitorUrls.length === 0) {
      setError('At least 1 competitor URL is required');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId,
          topic,
          requestedIdeaCount,
          competitorUrls,
          targetCountry,
          targetAudience,
          articleTone,
          category: category || undefined,
          wordCountTarget: wordCountTarget || undefined,
          imageRatio,
          imageStyle,
          generateImages,
          saveToDrive,
          sendToWordPress,
          autoRegenerateImages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create task');
        setLoading(false);
        return;
      }

      // Redirect to task detail page immediately
      router.push(`/tasks/${data.task.id}`);
    } catch {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Create New Article</h1>
        <p className="page-subtitle">
          Fill in the details to start AI-powered article generation
        </p>
      </div>

      <div className="card" style={{ maxWidth: 800 }}>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="login-error" style={{ marginBottom: 20 }}>
                {error}
              </div>
            )}

            {/* Website Selection */}
            <div className="form-group">
              <label className="form-label" htmlFor="website">
                <Globe size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Website
              </label>
              {websites.length === 0 ? (
                <p className="form-helper" style={{ color: 'var(--status-amber)' }}>
                  No websites configured. Please add a website in Settings first.
                </p>
              ) : (
                <select
                  id="website"
                  className="form-select"
                  value={websiteId}
                  onChange={(e) => setWebsiteId(e.target.value)}
                  required
                >
                  <option value="">Select a website...</option>
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.domain})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Topic */}
            <div className="form-group">
              <label className="form-label" htmlFor="topic">
                Article Topic
              </label>
              <input
                id="topic"
                type="text"
                className="form-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., 35 August Outfit Ideas"
                required
              />
            </div>

            {/* Number of Ideas */}
            <div className="form-group">
              <label className="form-label" htmlFor="ideaCount">
                Number of Ideas
              </label>
              <input
                id="ideaCount"
                type="number"
                className="form-input"
                value={requestedIdeaCount}
                onChange={(e) => setRequestedIdeaCount(parseInt(e.target.value, 10) || 1)}
                min={1}
                max={200}
                required
              />
              <p className="form-helper">Recommended: 10–50 ideas</p>
            </div>

            {/* Competitor URLs */}
            <div className="form-group">
              <label className="form-label" htmlFor="url1">
                Competitor URL 1 <span style={{ color: 'var(--status-red)' }}>*</span>
              </label>
              <input
                id="url1"
                type="url"
                className="form-input"
                value={competitorUrl1}
                onChange={(e) => setCompetitorUrl1(e.target.value)}
                placeholder="https://competitor.com/article"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="url2">
                Competitor URL 2 <span className="form-label-optional">(Optional)</span>
              </label>
              <input
                id="url2"
                type="url"
                className="form-input"
                value={competitorUrl2}
                onChange={(e) => setCompetitorUrl2(e.target.value)}
                placeholder="https://competitor2.com/article"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="url3">
                Competitor URL 3 <span className="form-label-optional">(Optional)</span>
              </label>
              <input
                id="url3"
                type="url"
                className="form-input"
                value={competitorUrl3}
                onChange={(e) => setCompetitorUrl3(e.target.value)}
                placeholder="https://competitor3.com/article"
              />
            </div>

            {/* Additional Settings */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 20, marginTop: 8 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: 16 }}>
                Additional Settings
              </h3>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="country">Target Country</label>
                  <input
                    id="country"
                    type="text"
                    className="form-input"
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    placeholder="US"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="audience">Target Audience</label>
                  <input
                    id="audience"
                    type="text"
                    className="form-input"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="general"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="tone">Article Tone</label>
                  <select
                    id="tone"
                    className="form-select"
                    value={articleTone}
                    onChange={(e) => setArticleTone(e.target.value)}
                  >
                    <option value="informative">Informative</option>
                    <option value="casual">Casual</option>
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="authoritative">Authoritative</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="category">Category</label>
                  <input
                    id="category"
                    type="text"
                    className="form-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Fashion, Tech, etc."
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="wordCount">Approx. Word Count</label>
                  <input
                    id="wordCount"
                    type="number"
                    className="form-input"
                    value={wordCountTarget}
                    onChange={(e) => setWordCountTarget(e.target.value ? parseInt(e.target.value, 10) : '')}
                    placeholder="e.g., 3000"
                    min={100}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="imgRatio">Image Aspect Ratio</label>
                  <select
                    id="imgRatio"
                    className="form-select"
                    value={imageRatio}
                    onChange={(e) => setImageRatio(e.target.value)}
                  >
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="4:3">4:3 (Standard)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="9:16">9:16 (Portrait)</option>
                  </select>
                </div>
              </div>

            </div>

            {/* Checkboxes */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 20, marginTop: 8 }}>
              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="genImages"
                  className="form-checkbox"
                  checked={generateImages}
                  onChange={(e) => setGenerateImages(e.target.checked)}
                />
                <label htmlFor="genImages" className="form-checkbox-label">
                  Generate image for every idea
                </label>
              </div>

              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="saveDrive"
                  className="form-checkbox"
                  checked={saveToDrive}
                  onChange={(e) => setSaveToDrive(e.target.checked)}
                />
                <label htmlFor="saveDrive" className="form-checkbox-label">
                  Save data to Google Drive
                </label>
              </div>

              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="sendWp"
                  className="form-checkbox"
                  checked={sendToWordPress}
                  onChange={(e) => setSendToWordPress(e.target.checked)}
                />
                <label htmlFor="sendWp" className="form-checkbox-label">
                  Send completed article to WordPress as draft
                </label>
              </div>

              <div className="form-checkbox-group">
                <input
                  type="checkbox"
                  id="autoRegen"
                  className="form-checkbox"
                  checked={autoRegenerateImages}
                  onChange={(e) => setAutoRegenerateImages(e.target.checked)}
                />
                <label htmlFor="autoRegen" className="form-checkbox-label">
                  Automatically regenerate images that fail QC
                </label>
              </div>
            </div>

            {/* Submit */}
            <div style={{ marginTop: 24 }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading || !websiteId || !topic}
              >
                {loading ? (
                  <>
                    <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Creating Task...
                  </>
                ) : (
                  <>
                    <FilePlus2 size={16} />
                    CREATE TASK
                  </>
                )}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
