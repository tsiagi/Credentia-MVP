import { AIEstimateBadge, VerifiedBadge } from 'core-roborate';

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const caption: React.CSSProperties = { color: 'var(--ink-3)', fontSize: 12, marginLeft: 10 };

export function Default() {
  return (
    <div style={row}>
      <AIEstimateBadge />
    </div>
  );
}

export function CustomLabels() {
  return (
    <div style={row}>
      <AIEstimateBadge label="AI Estimate" />
      <AIEstimateBadge label="Estimated comp · $148k" />
      <AIEstimateBadge label="Promotion readiness 78%" />
    </div>
  );
}

export function VersusVerified() {
  return (
    <div style={col}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <AIEstimateBadge label="AI Estimate" />
        <span style={caption}>Amber + sparkle — a suggestion, framed as an estimate</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <VerifiedBadge label="Verified" />
        <span style={caption}>Blue + shield — an attested, verified fact</span>
      </div>
    </div>
  );
}
