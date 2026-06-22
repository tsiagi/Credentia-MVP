import { PageHeader, Button } from 'core-roborate';
import { Plus, Download } from 'lucide-react';

const actionRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

export function Full() {
  return (
    <div style={{ width: 680 }}>
      <PageHeader
        eyebrow="Workforce verification"
        title="Verified credentials"
        subtitle="Manage attested employee records and review pending verification requests."
        actions={
          <div style={actionRow}>
            <Button variant="secondary" size="sm" leadingIcon={<Download size={15} />}>
              Export
            </Button>
            <Button variant="primary" size="sm" leadingIcon={<Plus size={15} />}>
              New request
            </Button>
          </div>
        }
      />
    </div>
  );
}

export function TitleOnly() {
  return (
    <div style={{ width: 680 }}>
      <PageHeader
        title="Team performance"
        subtitle="Verified facts and AI estimates, clearly separated."
      />
    </div>
  );
}

export function WithEyebrow() {
  return (
    <div style={{ width: 680 }}>
      <PageHeader
        eyebrow="Admin · Integrity"
        title="Manager verification monitor"
        actions={<Button variant="secondary" size="sm">Filters</Button>}
      />
    </div>
  );
}
