import { BookOpenCheck, Grid2X2, Leaf, MapPinned, Settings2, Users } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { ErrorState } from "../../components/ui/error-state";
import { Skeleton } from "../../components/ui/skeleton";
import { useIdentity } from "../../lib/identity";
import { ApplicationSettings } from "./ApplicationSettings";
import { CategorySettings } from "./CategorySettings";
import { CropSettings } from "./CropSettings";
import { FarmAreaSettings } from "./FarmAreaSettings";
import { PeopleSettings } from "./PeopleSettings";
import { errorMessage } from "./errors";

const sections = [
  { id: "people", label: "People", icon: Users },
  { id: "categories", label: "Expense Categories", icon: BookOpenCheck },
  { id: "crops", label: "Crops", icon: Leaf },
  { id: "areas", label: "Farm Areas", icon: MapPinned },
  { id: "application", label: "Application", icon: Settings2 },
] as const;

type SectionId = (typeof sections)[number]["id"];

export function SettingsPage() {
  const identity = useIdentity();
  const [activeSection, setActiveSection] = useState<SectionId>("people");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function moveSection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % sections.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + sections.length) % sections.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = sections.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    setActiveSection(sections[nextIndex]!.id);
    buttons.current[nextIndex]?.focus();
  }

  if (identity.isPending) return <div aria-label="Loading settings" className="settings-page settings-page--loading" role="status"><Skeleton /><Skeleton /></div>;
  if (identity.isError) return <ErrorState description={errorMessage(identity.error, "Your application identity could not be loaded.")} title="Settings are unavailable" />;

  const canAdmin = identity.data.role === "admin";
  return (
    <div className="settings-page">
      <header className="settings-page__hero">
        <div className="settings-page__hero-mark"><Grid2X2 aria-hidden="true" size={22} /></div>
        <div className="page-intro"><span>VKB Farm / Configuration</span><h2>Farm settings, kept in season.</h2><p>One careful place for the people, accounting labels, crops, and land references that hold the farm record together.</p></div>
        <div className="settings-page__role"><span>{canAdmin ? "Administrator" : "Read only"}</span><strong>{identity.data.email}</strong></div>
      </header>
      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-nav">
          {sections.map(({ icon: Icon, id, label }, index) => (
            <button
              aria-current={activeSection === id ? "page" : undefined}
              className={activeSection === id ? "is-active" : undefined}
              key={id}
              onClick={() => setActiveSection(id)}
              onKeyDown={(event) => moveSection(event, index)}
              ref={(node) => { buttons.current[index] = node; }}
              type="button"
            >
              <Icon aria-hidden="true" size={17} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <section aria-label="Settings workspace" className="settings-workspace" key={activeSection}>
          {activeSection === "people" ? <PeopleSettings canAdmin={canAdmin} /> : null}
          {activeSection === "categories" ? <CategorySettings canAdmin={canAdmin} /> : null}
          {activeSection === "crops" ? <CropSettings canAdmin={canAdmin} /> : null}
          {activeSection === "areas" ? <FarmAreaSettings canAdmin={canAdmin} /> : null}
          {activeSection === "application" ? <ApplicationSettings identity={identity.data} /> : null}
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
