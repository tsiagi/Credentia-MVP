import { Badge } from 'credentia';
import { ShieldCheck, Sparkles, Star, AlertTriangle } from 'lucide-react';

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
};

export function Tones() {
  return (
    <div style={row}>
      <Badge tone="neutral">Draft</Badge>
      <Badge tone="accent">Featured</Badge>
      <Badge tone="verified" icon={<ShieldCheck size={12} />}>Verified</Badge>
      <Badge tone="inferred" icon={<Sparkles size={12} />}>AI Estimate</Badge>
      <Badge tone="success">Active</Badge>
      <Badge tone="warn">Expiring soon</Badge>
      <Badge tone="danger">Revoked</Badge>
    </div>
  );
}

export function TrustVsInferred() {
  return (
    <div style={row}>
      <Badge tone="verified" icon={<ShieldCheck size={12} />}>Verified fact</Badge>
      <Badge tone="inferred" icon={<Sparkles size={12} />}>Model inference</Badge>
    </div>
  );
}

export function WithIcons() {
  return (
    <div style={row}>
      <Badge tone="accent" icon={<Star size={12} />}>Top performer</Badge>
      <Badge tone="warn" icon={<AlertTriangle size={12} />}>Needs review</Badge>
    </div>
  );
}
