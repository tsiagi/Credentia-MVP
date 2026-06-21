import { Skeleton, SkeletonText } from 'credentia';

const surface: React.CSSProperties = {
  width: 360,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  padding: 20,
};

export function ProfileLoading() {
  return (
    <div style={surface}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skeleton circle style={{ height: 48, width: 48 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton style={{ height: 16, width: 160 }} />
          <Skeleton style={{ height: 12, width: 96 }} />
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton style={{ height: 12, width: '100%' }} />
        <Skeleton style={{ height: 12, width: '100%' }} />
        <Skeleton style={{ height: 12, width: '66%' }} />
      </div>
      <Skeleton style={{ height: 96, width: '100%', marginTop: 16 }} />
    </div>
  );
}

export function Shapes() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
      <Skeleton circle style={{ height: 40, width: 40 }} />
      <Skeleton style={{ height: 40, width: 40 }} />
      <Skeleton style={{ height: 16, width: 128 }} />
      <Skeleton style={{ height: 96, width: 160 }} />
    </div>
  );
}

export function TextLines() {
  return (
    <div style={{ width: 288, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton style={{ height: 12, width: '100%' }} />
      <Skeleton style={{ height: 12, width: '100%' }} />
      <Skeleton style={{ height: 12, width: '100%' }} />
      <Skeleton style={{ height: 12, width: '66%' }} />
      <div style={{ marginTop: 4 }}>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}
