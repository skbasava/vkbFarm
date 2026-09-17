import { Clock3, Cloud, Coins, HardDriveUpload, ShieldCheck } from "lucide-react";
import type { ApplicationIdentity } from "../../lib/identity";
import { SectionHeading } from "./SettingsSection";

const facts = [
  { icon: Coins, label: "Currency", value: "INR (₹)", note: "All authoritative amounts are stored as integer paise." },
  { icon: Clock3, label: "Farm timezone", value: "Asia/Kolkata", note: "Farm dates stay local; audit timestamps use UTC." },
  { icon: Cloud, label: "Production access", value: "Cloudflare Access + active person", note: "A verified Access email must map to an active person record." },
  { icon: HardDriveUpload, label: "Receipt limit", value: "10 MiB", note: "JPG, JPEG, PNG, and PDF receipts are accepted." },
] as const;

export function ApplicationSettings({ identity }: { identity: ApplicationIdentity }) {
  return (
    <section aria-labelledby="application-settings-title" className="settings-section settings-application">
      <SectionHeading description="Review the fixed operating rules and the identity currently connected to this session." eyebrow="Environment & session" id="application-settings-title" title="Application" />
      <div className="settings-identity-card">
        <span><ShieldCheck aria-hidden="true" size={20} /></span>
        <div><small>Signed in as</small><strong>{identity.email}</strong><p>{identity.role[0]?.toUpperCase()}{identity.role.slice(1)}</p></div>
      </div>
      <div className="settings-facts">
        {facts.map(({ icon: Icon, label, note, value }) => (
          <article key={label}>
            <Icon aria-hidden="true" size={20} />
            <small>{label}</small>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </div>
      <p className="settings-application__note">These fixed operating rules are informational and cannot be edited here.</p>
    </section>
  );
}
