import { EmptyState, Button } from 'credentia';
import { Inbox, ShieldCheck, Search, Plus } from 'lucide-react';

const surface: React.CSSProperties = {
  width: 460,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
};

export function NoRequests() {
  return (
    <div style={surface}>
      <EmptyState
        icon={<Inbox size={22} />}
        title="No verification requests"
        description="When teammates request a credential check, it will appear here for review."
        action={
          <Button variant="primary" size="sm" leadingIcon={<Plus size={15} />}>
            New request
          </Button>
        }
      />
    </div>
  );
}

export function NoResults() {
  return (
    <div style={surface}>
      <EmptyState
        icon={<Search size={22} />}
        title="No matching employees"
        description="Try a different name, role, or verification status."
      />
    </div>
  );
}

export function AllVerified() {
  return (
    <div style={surface}>
      <EmptyState
        icon={<ShieldCheck size={22} />}
        title="Everything is verified"
        description="All credentials in this team have been attested. No pending items."
      />
    </div>
  );
}
