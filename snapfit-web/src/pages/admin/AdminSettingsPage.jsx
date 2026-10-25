import { ShieldCheck } from 'lucide-react';
import Card from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import { AppearanceTab } from '../dashboard/SettingsPage';

function AdminSettingsPage() {
  const { merchant } = useAuth();

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Appearance and account details for the admin console.</p>

      <div className="mt-6 grid max-w-3xl grid-cols-1 gap-6">
        <AppearanceTab />

        <Card>
          <Card.Header>
            <h2 className="text-sm font-semibold text-foreground">Super admin account</h2>
          </Card.Header>
          <Card.Body>
            <div className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-admin-soft text-admin">
                <ShieldCheck size={18} aria-hidden="true" />
              </span>
              <div className="text-sm">
                <p className="font-medium text-foreground">{merchant?.email}</p>
                <p className="mt-1 text-muted-foreground">
                  The super admin login is managed in the backend&apos;s <code className="font-mono text-foreground">.env</code>{' '}
                  file, not here. To change its email or password, update those values on the server and restart it.
                </p>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}

export default AdminSettingsPage;
