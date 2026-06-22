import { VerifiedBadge, AIEstimateBadge } from 'core-roborate';

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const caption: React.CSSProperties = { color: 'var(--ink-3)', fontSize: 12, marginLeft: 10 };

export function Default() {
  return (
    <div style={row}>
      <VerifiedBadge />
    </div>
  );
}

export function CustomLabels() {
  return (
    <div style={row}>
      <VerifiedBadge label="Verified credential" />
      <VerifiedBadge label="Employment confirmed" />
      <VerifiedBadge label="Attested by manager" />
    </div>
  );
}

export function VersusAIEstimate() {
  return (
    <div style={col}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <VerifiedBadge label="Verified" />
        <span style={caption}>Blue + shield — a fact attested by a real human</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <AIEstimateBadge label="AI Estimate" />
        <span style={caption}>Amber + sparkle — a model-generated estimate, never a fact</span>
      </div>
    </div>
  );
}
