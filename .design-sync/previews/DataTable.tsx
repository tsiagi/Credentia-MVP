import { DataTable, VerifiedBadge, AIEstimateBadge, StatusPill, Button, EmptyState } from 'core-roborate';
import { Users, UserPlus } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'pending' | 'inactive' | 'flagged';
  trust: 'verified' | 'inferred';
  fit: number;
}

const ROWS: Employee[] = [
  { id: 'e1', name: 'Priya Raman', role: 'Senior Software Engineer', status: 'active', trust: 'verified', fit: 94 },
  { id: 'e2', name: 'Marcus Bell', role: 'Product Manager', status: 'pending', trust: 'inferred', fit: 81 },
  { id: 'e3', name: 'Dana Whitfield', role: 'Engineering Manager', status: 'active', trust: 'verified', fit: 89 },
  { id: 'e4', name: 'Leo Tanaka', role: 'Data Analyst', status: 'flagged', trust: 'inferred', fit: 67 },
];

const columns = [
  {
    key: 'name',
    header: 'Employee',
    sortValue: (r: Employee) => r.name,
    render: (r: Employee) => (
      <span className="font-medium" style={{ color: 'var(--ink)' }}>{r.name}</span>
    ),
  },
  {
    key: 'role',
    header: 'Role',
    render: (r: Employee) => <span style={{ color: 'var(--ink-2)' }}>{r.role}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    render: (r: Employee) => <StatusPill status={r.status} />,
  },
  {
    key: 'trust',
    header: 'Core-Roboratel',
    render: (r: Employee) =>
      r.trust === 'verified' ? (
        <VerifiedBadge label="Verified" />
      ) : (
        <AIEstimateBadge label="AI Estimate" />
      ),
  },
  {
    key: 'fit',
    header: 'Fit',
    align: 'right' as const,
    sortValue: (r: Employee) => r.fit,
    render: (r: Employee) => (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.fit}%</span>
    ),
  },
];

export function Populated() {
  return (
    <div style={{ width: 720 }}>
      <DataTable columns={columns} rows={ROWS} rowKey={(r) => r.id} />
    </div>
  );
}

export function Loading() {
  return (
    <div style={{ width: 720 }}>
      <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading skeletonRows={4} />
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ width: 720 }}>
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={<Users size={22} />}
            title="No employees yet"
            description="Provision your first employees to begin tracking verified credentials."
            action={
              <Button variant="primary" size="sm" leadingIcon={<UserPlus size={15} />}>
                Add employee
              </Button>
            }
          />
        }
      />
    </div>
  );
}
