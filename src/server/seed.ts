import { placeFurniture } from "@/domain/furniture";
import { generateLayoutOptions } from "@/domain/layout";
import { createProject } from "@/domain/project";
import { addAmenity, applyFacadeTemplate } from "@/domain/templates";
import * as store from "./store";

/**
 * System seeding for the single-tenant demo. This is deterministic fixture
 * setup, not an AI write: it uses the same canonical domain constructors and
 * layout engine that the tools use, then persists the result as revision 1.
 */
export async function ensureDemoProject(): Promise<string> {
  const existing = await store.listProjects();
  if (existing.length > 0) return existing[0]!.id;

  const project = createProject({
    name: "Akshaya Residence",
    type: "independent_house",
    plotWidth: 50,
    plotDepth: 70,
    plotUnit: "ft",
    city: "Bengaluru",
    state: "Karnataka",
    bedrooms: 3,
    bathrooms: 3,
    floors: 2,
    description:
      "A 3-bedroom courtyard home on a 50 × 70 ft east-facing plot. Brief: cross ventilation, a shaded rear garden, a small pool for the family, a roof terrace, and Vaastu-aligned sleeping areas.",
  });

  project.site.setbacks = { front: 4, rear: 4, left: 2, right: 2 };
  project.brief.parking = true;
  project.brief.pooja = true;
  project.brief.requirements = [
    "3 bedrooms with attached bathrooms",
    "Separate pooja space",
    "Shaded rear garden and plunge pool",
    "Roof terrace with planters",
    "Cross ventilation to living and bedrooms",
  ];
  project.brief.updatedAt = new Date().toISOString();

  const candidates = generateLayoutOptions(project, {
    max_options: 3,
    program_description: project.brief.description,
    objective_weights: {
      space_efficiency: 0.3,
      vastu_alignment: 0.3,
      circulation: 0.2,
      daylight_potential: 0.15,
      cost: 0.05,
    },
  });

  if (candidates.length > 0) {
    project.floors = structuredClone(candidates[0]!.floors);
    project.floors.forEach((floor, index) => {
      floor.level = index;
      floor.source = "generated";
    });
    project.brief.floors = project.floors.length;
  }

  applyFacadeTemplate(project, "modern-monolith");
  try {
    addAmenity(project, "lap-pool");
  } catch {
    // A tight plot can legitimately have no free pool rectangle.
  }
  try {
    addAmenity(project, "rear-garden");
  } catch {
    // Keep the demo valid even if the garden cannot be placed.
  }
  try {
    addAmenity(project, "roof-terrace-garden");
  } catch {
    // Roof amenities are optional.
  }

  const firstRoomOfType = (type: string) =>
    project.floors.flatMap((floor) => floor.rooms).find((room) => room.type === type);

  const furnished: { template: string; roomType: string }[] = [
    { template: "living-sofa-3", roomType: "living" },
    { template: "living-coffee-table", roomType: "living" },
    { template: "living-tv-unit", roomType: "living" },
    { template: "dining-table-6", roomType: "dining" },
    { template: "bed-king", roomType: "master_bedroom" },
    { template: "bedroom-wardrobe", roomType: "master_bedroom" },
    { template: "kitchen-counter", roomType: "kitchen" },
  ];
  for (const item of furnished) {
    const room = firstRoomOfType(item.roomType);
    if (!room) continue;
    try {
      placeFurniture(project, item.template, room.id);
    } catch {
      // A tight room may legitimately not fit a particular piece.
    }
  }

  project.revision = 1;
  project.updatedAt = new Date().toISOString();
  await store.saveProject(project);
  if (candidates.length > 0) await store.saveCandidates(project.id, candidates);
  return project.id;
}
