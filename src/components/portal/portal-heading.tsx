/** The portal homes' heading: school, page title and a welcome by first name (D47). */
export function PortalHeading({
  schoolName,
  title,
  fullName,
}: {
  schoolName: string | undefined;
  title: string;
  fullName: string;
}) {
  const firstName = fullName.split(" ")[0];
  return (
    <div>
      <p className="text-muted-foreground text-sm">{schoolName}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{firstName ? `Welcome, ${firstName}.` : "Welcome."}</p>
    </div>
  );
}
