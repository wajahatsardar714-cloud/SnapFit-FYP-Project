import Card from './Card';

// label text-sm text-muted-foreground, value text-2xl font-semibold text-foreground, with an
// optional small badge (e.g. a trend Badge) pinned to the top-right corner.
function StatCard({ label, value, sub, badge }) {
  return (
    <Card className="relative">
      {badge && <div className="absolute right-4 top-4">{badge}</div>}
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export default StatCard;
