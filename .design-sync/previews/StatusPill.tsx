import { StatusPill } from 'credentia';

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
};

export function AllStatuses() {
  return (
    <div style={row}>
      <StatusPill status="active" />
      <StatusPill status="pending" />
      <StatusPill status="inactive" />
      <StatusPill status="flagged" />
      <StatusPill status="verified" />
      <StatusPill status="info" />
    </div>
  );
}

export function LifecycleLabels() {
  return (
    <div style={row}>
      <StatusPill status="active" label="Employed" />
      <StatusPill status="pending" label="Awaiting attestation" />
      <StatusPill status="inactive" label="Former employee" />
      <StatusPill status="flagged" label="Integrity flag" />
    </div>
  );
}
