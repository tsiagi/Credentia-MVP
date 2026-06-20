import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  Button,
  VerifiedBadge,
  AIEstimateBadge,
} from 'credentia';
import { MoreHorizontal, ArrowRight } from 'lucide-react';

export function Composed() {
  return (
    <div style={{ width: 420 }}>
      <Card>
        <CardHeader
          action={
            <Button variant="ghost" size="sm" leadingIcon={<MoreHorizontal size={15} />}>
              Manage
            </Button>
          }
        >
          <CardTitle>Senior Software Engineer</CardTitle>
          <CardDescription>Attested by Priya Raman · Engineering</CardDescription>
        </CardHeader>
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <VerifiedBadge label="Verified credential" />
            <AIEstimateBadge label="AI Estimate · 92% fit" />
          </div>
          <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-2)' }}>
            Employment dates and title verified by the reporting manager on 14 May 2026.
            Promotion readiness is a model estimate, not an attested fact.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export function Interactive() {
  return (
    <div style={{ width: 360 }}>
      <Card interactive padding="md">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Workforce verification queue
            </p>
            <p style={{ marginTop: 2, fontSize: 12, color: 'var(--ink-3)' }}>
              18 requests awaiting attestation
            </p>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--ink-3)' }} />
        </div>
      </Card>
    </div>
  );
}

export function PaddingPresets() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <Card padding="sm" style={{ width: 160 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Compact</p>
        <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>padding sm</p>
      </Card>
      <Card padding="lg" style={{ width: 160 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Spacious</p>
        <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>padding lg</p>
      </Card>
    </div>
  );
}
