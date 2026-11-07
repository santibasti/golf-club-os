/**
 * Deterministic demo seed. All data is FICTIONAL.
 * History is produced by driving the real domain services (booking → check-in → caddies → carts → starter → payments),
 * so charges, payments, caddie settlements, carts and audit logs are mutually consistent.
 */
import type { Asset, Caddie, Cart, Customer, DB, InventoryItem, Member, MembershipPlan, RoleId, Settings, Staff, WorkOrder } from "./types";
import { DEFAULT_ROLE_PERMS, ROLES } from "./permissions";
import { addDays, dow, fromMin, manilaToday, mkTs, toMin, addMonths, diffDays, monthStart } from "./time";
import { Ctx, DomainError, SYSTEM } from "./services/core";
import * as Bk from "./services/booking";
import * as Fl from "./services/flight";
import * as Cd from "./services/caddie";
import * as Ct from "./services/cart";
import * as Fn from "./services/finance";
import * as Ms from "./services/membership";
import * as Pos from "./services/pos";
import * as Mt from "./services/maintenance";
import * as Ev from "./services/events";
import { nextId } from "./services/core";

export const SEED_VERSION = 7;
export const DEMO_NOW_TIME = "09:00";

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const FIRST = ["Jose", "Maria", "Juan", "Ana", "Miguel", "Cristina", "Antonio", "Elena", "Rafael", "Teresa", "Carlo", "Patricia", "Marco", "Angela", "Paolo", "Isabel", "Ramon", "Lourdes", "Eduardo", "Mercedes", "Gabriel", "Sofia", "Luis", "Carmen", "Andres", "Beatriz", "Fernando", "Katrina", "Joaquin", "Marites", "Ricardo", "Gloria", "Dennis", "Rowena", "Alvin", "Jocelyn", "Noel", "Cecilia", "Rommel", "Liza", "Arnel", "Divina", "Jericho", "Bernadette", "Victor", "Maricar", "Emmanuel", "Nina", "Francis", "Camille", "Allan", "Josephine", "Benjamin", "Rhea", "Gerald", "Imelda", "Christian", "Hazel", "Leonard", "Corazon"];
const LAST = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Tomas", "Andrada", "Castillo", "Flores", "Villanueva", "Ramos", "Aquino", "Dela Cruz", "Navarro", "Salazar", "Domingo", "Mercado", "Aguilar", "Pascual", "Manalo", "Soriano", "Valdez", "Lim", "Tan", "Go", "Chua", "Uy", "Sy", "Lopez", "Gonzales", "Rivera", "Fernandez", "Del Rosario", "Hernandez", "De Guzman", "Francisco", "Alvarez", "Cabrera", "Panganiban", "Macaraeg", "Dizon", "Enriquez", "Magsaysay", "Pangilinan", "Evangelista", "Natividad", "Velasco", "Zamora"];
const STREETS = ["Rizal St.", "Mabini Ave.", "Bonifacio Rd.", "Aguinaldo Hwy.", "Del Pilar St.", "Katipunan Ave.", "Sampaguita St.", "Narra Lane", "Acacia Drive"];
const TOWNS = ["Silang, Cavite", "Tagaytay City", "Dasmariñas, Cavite", "Biñan, Laguna", "Makati City", "Quezon City", "Parañaque City", "Santa Rosa, Laguna", "Alabang, Muntinlupa", "Imus, Cavite"];

export function defaultSettings(): Settings {
  return {
    club: { tenantId: "club_demo_001", name: "Sierra Verde Golf & Country Club (FICTIONAL)", shortName: "Sierra Verde", address: "Km 58 Aguinaldo Highway, Silang, Cavite — fictional address", phone: "(046) 555-0100", email: "frontdesk@sierraverde.example", timezone: "Asia/Manila", currency: "PHP" },
    teeSheet: { firstTee: "06:00", lastTee: "15:30", interval: 10, maxPlayers: 4, startingTees: ["1"], allowSharedSlots: false, advanceDaysPublic: 7, advanceDaysMember: 14, minNoticeMinutes: 30, cancelHours: 24, forfeitDepositOnLateCancel: true, depositPerPlayer: 500, depositRequiredForPublic: false, noShowStrikeLimit: 2,
      holidays: [{ date: "2026-11-30", name: "Bonifacio Day" }, { date: "2026-12-08", name: "Immaculate Conception" }, { date: "2026-12-24", name: "Christmas Eve" }, { date: "2026-12-25", name: "Christmas Day" }, { date: "2026-12-30", name: "Rizal Day" }, { date: "2026-12-31", name: "New Year's Eve" }, { date: "2027-01-01", name: "New Year's Day" }] },
    rates: { green: { weekday: { public: 2800, member: 1200, guest: 2200 }, weekend: { public: 3600, member: 1200, guest: 2200 }, holiday: { public: 4200, member: 1200, guest: 2200 } }, ninePct: 60, cart18: 1200, cart9: 700, playersPerCart: 2,
      caddie: { A: { f18: 650, f9: 380 }, B: { f18: 550, f9: 320 }, C: { f18: 450, f9: 260 } }, caddieClubSharePct: { employee: 100, contractor: 0, freelance: 10 }, playersPerCaddie: 2, caddieRequired: true,
      range: { bucketS: 100, bucketM: 150, bucketL: 250, per30min: 350, clubRental: 300 } },
    pace: { minutes18: 270, minutes9: 135, toleranceMin: 10 }, rotation: { mode: "fewest_rounds", allowPreferred: true },
    billing: { guestFeeBillTo: "sponsor", memberDefault: "account", dueDays: 30 }, tax: { vatRate: 12, serviceChargePct: 0, note: "Placeholder only — prices shown are tax-inclusive. No BIR-compliant invoicing is implemented in this demo." },
    authority: { posDiscountStaffMaxPct: 10 },
    departments: [{ id: "golf", name: "Golf Operations", head: "Marco Reyes", active: true }, { id: "membership", name: "Membership", head: "Carmela Bautista", active: true }, { id: "course", name: "Course Maintenance", head: "Engr. Felix Tolentino", active: true }, { id: "fnb", name: "Café & F&B", head: "Grace Domingo", active: true }, { id: "finance", name: "Finance", head: "Maricel Ocampo", active: true }, { id: "events", name: "Events", head: "Patrick Lim", active: true }],
  };
}

const PLANS: MembershipPlan[] = [
  { id: "PL-IND", name: "Individual", description: "Single-person playing membership.", active: true, joiningFee: 25000, annualDues: 36000, billingCycle: "monthly", greenFee18: 1200, greenFee9: 720, guestsPerRound: 2, guestRate18: 2200, advanceDays: 14, priorityAccess: true, cartDiscountPct: 10, rangeDiscountPct: 20, cafeDiscountPct: 10, accountCharging: true, creditLimit: 30000, termMonths: 12 },
  { id: "PL-FAM", name: "Family", description: "Household membership (assumed up to 4 named players).", active: true, joiningFee: 40000, annualDues: 60000, billingCycle: "monthly", greenFee18: 900, greenFee9: 540, guestsPerRound: 3, guestRate18: 2000, advanceDays: 14, priorityAccess: true, cartDiscountPct: 15, rangeDiscountPct: 25, cafeDiscountPct: 10, accountCharging: true, creditLimit: 50000, termMonths: 12 },
  { id: "PL-COR", name: "Corporate", description: "Company-held membership with nominated players.", active: true, joiningFee: 100000, annualDues: 120000, billingCycle: "quarterly", greenFee18: 1000, greenFee9: 600, guestsPerRound: 4, guestRate18: 2000, advanceDays: 14, priorityAccess: true, cartDiscountPct: 10, rangeDiscountPct: 20, cafeDiscountPct: 10, accountCharging: true, creditLimit: 80000, termMonths: 12 },
  { id: "PL-LIF", name: "Lifetime", description: "One-time lifetime playing right.", active: true, joiningFee: 450000, annualDues: 0, billingCycle: "none", greenFee18: 600, greenFee9: 360, guestsPerRound: 3, guestRate18: 1800, advanceDays: 21, priorityAccess: true, cartDiscountPct: 20, rangeDiscountPct: 30, cafeDiscountPct: 15, accountCharging: true, creditLimit: 60000, termMonths: null },
  { id: "PL-JUN", name: "Junior", description: "Players under 18 (assumed).", active: true, joiningFee: 5000, annualDues: 12000, billingCycle: "annual", greenFee18: 500, greenFee9: 300, guestsPerRound: 0, guestRate18: 2200, advanceDays: 10, priorityAccess: false, cartDiscountPct: 0, rangeDiscountPct: 30, cafeDiscountPct: 5, accountCharging: false, creditLimit: 0, termMonths: 12 },
  { id: "PL-SEN", name: "Senior", description: "Players 60+ (assumed).", active: true, joiningFee: 15000, annualDues: 24000, billingCycle: "monthly", greenFee18: 800, greenFee9: 480, guestsPerRound: 2, guestRate18: 2200, advanceDays: 14, priorityAccess: true, cartDiscountPct: 15, rangeDiscountPct: 20, cafeDiscountPct: 10, accountCharging: true, creditLimit: 25000, termMonths: 12 },
];

const POS_ITEMS: [string, string, InventoryItem["category"], number, number, number, number][] = [
  ["BEV-01", "Bottled water 500ml", "beverage", 25, 10, 240, 60], ["BEV-02", "Iced tea (glass)", "beverage", 65, 18, 120, 30], ["BEV-03", "Cola 330ml", "beverage", 55, 24, 180, 48], ["BEV-04", "San Miguel Light", "beverage", 90, 48, 150, 48], ["BEV-05", "Fresh buko juice", "beverage", 85, 30, 60, 20],
  ["COF-01", "Brewed coffee", "coffee", 95, 22, 300, 50], ["COF-02", "Americano", "coffee", 110, 26, 300, 50], ["COF-03", "Cappuccino", "coffee", 140, 38, 200, 40], ["COF-04", "Café latte", "coffee", 150, 42, 200, 40], ["COF-05", "Iced latte", "coffee", 160, 46, 160, 40],
  ["MEL-01", "Chicken adobo rice meal", "meal", 285, 110, 70, 15], ["MEL-02", "Beef tapa silog", "meal", 295, 125, 60, 15], ["MEL-03", "Club sandwich", "meal", 265, 95, 55, 12], ["MEL-04", "Pancit canton", "meal", 210, 70, 50, 12], ["MEL-05", "Sinigang na baboy", "meal", 320, 130, 40, 10], ["MEL-06", "Clubhouse burger & fries", "meal", 310, 120, 45, 12],
  ["SNK-01", "French fries", "snack", 120, 35, 80, 20], ["SNK-02", "Siopao asado", "snack", 95, 38, 90, 24], ["SNK-03", "Banana cue", "snack", 60, 18, 70, 20], ["SNK-04", "Nachos", "snack", 180, 60, 45, 12], ["SNK-05", "Halo-halo", "snack", 140, 45, 50, 14],
  ["REF-01", "Halfway-house hotdog", "refreshment", 110, 40, 90, 24], ["REF-02", "Energy bar", "refreshment", 80, 40, 100, 24], ["REF-03", "Sports drink 500ml", "refreshment", 75, 35, 130, 36], ["REF-04", "Cold towel", "refreshment", 30, 6, 200, 50], ["REF-05", "Sunscreen sachet", "refreshment", 45, 20, 60, 20],
];

function fullName(rng: () => number, used: Set<string>) { for (;;) { const n = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`; if (!used.has(n)) { used.add(n); return n; } } }
const phone = (rng: () => number) => `09${Math.floor(rng() * 9) + 1}${String(Math.floor(rng() * 1e8)).padStart(8, "0")}`;
const pick = <T,>(rng: () => number, xs: T[]) => xs[Math.floor(rng() * xs.length)];
const as = (role: RoleId): Ctx => ({ role, actor: ROLES.find((r) => r.id === role)!.user, bypass: true });

export function createSeedDB(todayOverride?: string): DB {
  const rng = mulberry32(20260507);
  const today = todayOverride ?? manilaToday();
  const settings = defaultSettings();
  const db: DB = {
    meta: { version: SEED_VERSION, clubId: settings.club.tenantId, seededAt: today, today, now: mkTs(addDays(today, -30), "05:00"), seed: 20260507 }, seq: {}, settings,
    rolePerms: JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMS)), holes: [], closures: [], customers: [], plans: JSON.parse(JSON.stringify(PLANS)), members: [], sponsorships: [], bookings: [], rounds: [], waitlist: [], messages: [],
    caddies: [], caddieAttendance: [], rotationEvents: [], caddieAssignments: [], caddieSettlements: [], carts: [], cartDispatches: [], staff: [], workOrders: [], recurring: [], assets: [], inventory: [], movements: [],
    posOrders: [], rangeSales: [], rangeTabs: [], cafeTabs: [], charges: [], payments: [], refunds: [], shifts: [], events: [], announcements: [], feedback: [], audit: [], maintBudget: {}, historicalMonthly: [],
  };

  /* ---------------------------- reference data ---------------------------- */
  const pars = [4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]; const si = [7, 3, 15, 9, 1, 11, 5, 17, 13, 10, 2, 16, 4, 12, 6, 18, 8, 14];
  const teams = ["Greens Crew", "Fairway Crew", "Irrigation Team", "Landscape Crew"];
  db.holes = pars.map((par, i) => ({ no: i + 1, par, si: si[i], yards: par === 3 ? 150 + ((i * 17) % 50) : par === 4 ? 340 + ((i * 23) % 90) : 480 + ((i * 11) % 60), condition: "good", team: teams[i % 4] }));
  db.holes[3].condition = "fair"; db.holes[13].condition = "poor"; db.holes[8].condition = "excellent"; db.holes[16].condition = "excellent"; db.holes[10].condition = "fair";
  db.maintBudget = { Greens: 90000, Fairways: 70000, "Tee boxes": 25000, Bunkers: 30000, Rough: 20000, Irrigation: 60000, Drainage: 25000, "Trees & landscaping": 35000, Pathways: 20000, "Clubhouse exterior": 30000, "Course equipment": 55000, "Golf carts": 40000 };

  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const used = new Set<string>();
  for (let i = 0; i < 150; i++) {
    const name = fullName(rng, used); const age = 12 + Math.floor(rng() * 60);
    const c: Customer = { id: nextId(db, "customer", "C-", 4), name, phone: phone(rng), email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.test`, address: `${Math.floor(rng() * 200) + 1} ${pick(rng, STREETS)}, ${pick(rng, TOWNS)}`, birthDate: `${2026 - age}-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rng() * 28)).padStart(2, "0")}`, createdAt: mkTs(addDays(today, -200), "09:00") };
    db.customers.push(c);
  }
  // members: 60 active + 4 expired + 3 suspended + 4 pending + 3 applicants
  const planFor = (i: number) => (i < 28 ? "PL-IND" : i < 40 ? "PL-FAM" : i < 47 ? "PL-COR" : i < 52 ? "PL-LIF" : i < 55 ? "PL-JUN" : "PL-SEN");
  const statuses: Member["status"][] = [...Array(60).fill("active"), ...Array(4).fill("expired"), ...Array(3).fill("suspended"), ...Array(4).fill("pending_approval"), ...Array(3).fill("applicant")];
  const memberCustomerIdx = Array.from({ length: 74 }, (_, i) => i);
  statuses.forEach((st, i) => {
    const cust = db.customers[memberCustomerIdx[i]]; const planId = st === "active" || st === "suspended" || st === "expired" ? planFor(i % 60) : pick(rng, ["PL-IND", "PL-FAM", "PL-SEN"]);
    const plan = db.plans.find((p) => p.id === planId)!; const actAgo = 30 + Math.floor(rng() * 330);
    const m: Member = { id: nextId(db, "member", "M-", 4), customerId: cust.id, planId, status: st, applicationDate: addDays(today, -(actAgo + 10)), emergencyContact: { name: pick(rng, FIRST) + " " + pick(rng, LAST), phone: phone(rng), relation: pick(rng, ["Spouse", "Sibling", "Parent", "Child", "Friend"]) }, billingPref: plan.accountCharging && rng() > 0.1 ? "account" : "counter", docs: {}, colorSeed: i * 5 + 1, history: [] };
    if (["active", "suspended", "expired"].includes(st)) {
      let act = addDays(today, -actAgo); if (st === "expired") act = addDays(today, -(380 + i)); m.activationDate = act;
      m.expiryDate = plan.termMonths ? addMonths(act, plan.termMonths) : undefined;
      if (st === "active" && m.expiryDate && m.expiryDate < today) m.expiryDate = addMonths(m.expiryDate, 12);
      if (st === "active" && i % 11 === 0 && plan.termMonths) m.expiryDate = addDays(today, 5 + (i % 25)); // a few renewals due soon
      if (st === "expired") m.expiryDate = addDays(today, -(10 + i * 3));
      for (const d of ["application_form", "valid_id", "photo", "proof_of_address"]) m.docs[d] = true;
      m.history.push({ at: mkTs(act, "10:00"), by: "Carmela Bautista", text: "Approved and activated (historical record)" });
      if (st === "suspended") m.history.push({ at: mkTs(addDays(today, -12), "11:00"), by: "Eduardo Santiago", text: "Suspended: unsettled account over 60 days" });
      if (st === "active" && plan.billingCycle !== "none") m.nextBillingDate = plan.billingCycle === "annual" ? addMonths(act, 12) : monthStart(addMonths(addDays(today, 0).slice(0, 8) + "01", -1));
    } else {
      m.docs.application_form = true; m.docs.valid_id = st === "pending_approval" || i % 2 === 0; if (st === "pending_approval") { m.docs.photo = true; m.history.push({ at: mkTs(addDays(today, -3), "14:00"), by: "Carmela Bautista", text: "Submitted for approval (documents complete)" }); }
      else m.history.push({ at: mkTs(addDays(today, -1), "10:00"), by: "Carmela Bautista", text: "Application received" });
    }
    cust.memberId = m.id; db.members.push(m);
  });
  // lifetime / annual billing dates cleanup
  for (const m of db.members) if (m.status === "active") { const p = db.plans.find((x) => x.id === m.planId)!; if (p.billingCycle === "quarterly") m.nextBillingDate = monthStart(addMonths(today.slice(0, 8) + "01", -1)); if (p.billingCycle === "annual") m.nextBillingDate = addMonths(m.activationDate!, 12) > today ? addMonths(m.activationDate!, 12) : addMonths(today, 6); }

  // caddies
  const classes: Caddie["classification"][] = [...Array(12).fill("employee"), ...Array(25).fill("contractor"), ...Array(8).fill("freelance")];
  for (let i = 0; i < 45; i++) {
    db.caddies.push({ id: `CD-${String(i + 1).padStart(3, "0")}`, name: fullName(rng, used), phone: phone(rng), classification: classes[i], category: i < 10 ? "A" : i < 30 ? "B" : "C", priority: i + 1, status: "off", notes: i % 9 === 0 ? "Good with first-time golfers." : "", colorSeed: i * 3 + 2, incidents: i === 17 ? [{ id: "CI-0001", at: mkTs(addDays(today, -40), "10:00"), severity: "minor", text: "Late return of scorecard", by: "Rodel Manalo" }] : [], baseRounds: 40 + Math.floor(rng() * 220), baseFees: 0 });
    db.caddies[i].baseFees = db.caddies[i].baseRounds * (db.caddies[i].category === "A" ? 600 : db.caddies[i].category === "B" ? 500 : 420);
  }
  // carts
  for (let i = 1; i <= 30; i++) {
    const four = i >= 25 && i <= 28; const gas = i >= 29;
    db.carts.push({ id: `CART-${String(i).padStart(2, "0")}`, no: i, type: four ? "4-seater" : "2-seater", seats: four ? 4 : 2, fuel: gas ? "gas" : "electric", condition: i % 9 === 0 ? "fair" : "good", battery: gas ? 100 : 100, status: "available", history: [] });
  }
  // staff
  const staffDefs: [string, string, string, string][] = [["Joel Mercado", "Course Maintenance", "Mechanic", "Cart Maintenance"], ["Ricky Dela Peña", "Course Maintenance", "Greenskeeper", "Greens Crew"], ["Bong Sarmiento", "Course Maintenance", "Greenskeeper", "Greens Crew"], ["Tonyo Abad", "Course Maintenance", "Groundskeeper", "Fairway Crew"], ["Erwin Calma", "Course Maintenance", "Groundskeeper", "Fairway Crew"], ["Mario Pineda", "Course Maintenance", "Irrigation Technician", "Irrigation Team"], ["Dado Ilagan", "Course Maintenance", "Irrigation Technician", "Irrigation Team"], ["Susan Verano", "Course Maintenance", "Landscaper", "Landscape Crew"], ["Cardo Buenaventura", "Course Maintenance", "Landscaper", "Landscape Crew"], ["Lito Esguerra", "Course Maintenance", "Mechanic", "Cart Maintenance"], ["Nestor Aguilar", "Golf Operations", "Cart Supervisor", ""], ["Danilo Pascual", "Golf Operations", "Starter", ""], ["Rodel Manalo", "Golf Operations", "Caddie Master", ""]];
  staffDefs.forEach(([name, department, title, team], i) => db.staff.push({ id: `ST-${String(i + 1).padStart(3, "0")}`, name, department, title, team, phone: phone(rng), active: true }));
  // assets
  const assetDefs: [string, Asset["category"], string, string][] = [["Toro Greensmaster 3150 #1", "Maintenance machines", "Greens Crew", "Maintenance shed"], ["Toro Greensmaster 3150 #2", "Maintenance machines", "Greens Crew", "Maintenance shed"], ["Fairway mower Jacobsen LF570", "Maintenance machines", "Fairway Crew", "Maintenance shed"], ["Rough mower Toro 4500-D", "Maintenance machines", "Fairway Crew", "Maintenance shed"], ["Kubota tractor L3901", "Maintenance machines", "Fairway Crew", "Maintenance shed"], ["Core aerator", "Maintenance machines", "Greens Crew", "Maintenance shed"], ["Topdresser", "Maintenance machines", "Greens Crew", "Maintenance shed"], ["Boom sprayer 400L", "Maintenance machines", "Fairway Crew", "Maintenance shed"], ["Utility vehicle Kawasaki Mule", "Maintenance machines", "Landscape Crew", "Maintenance shed"], ["Bunker rake set (18)", "Course equipment", "Fairway Crew", "Course"], ["Ball washers (18)", "Course equipment", "Fairway Crew", "Course"], ["Portable irrigation pump", "Course equipment", "Irrigation Team", "Pump house"], ["Hole cutter set", "Tools", "Greens Crew", "Maintenance shed"], ["Chainsaw Stihl MS 250", "Tools", "Landscape Crew", "Maintenance shed"], ["Generator 5kVA", "Tools", "Irrigation Team", "Pump house"], ["Power tool kit", "Tools", "Cart Maintenance", "Cart barn"], ["Rental club set — Titleist (6)", "Golf rental equipment", "Pro shop", "Pro shop"], ["Rental club set — Callaway (6)", "Golf rental equipment", "Pro shop", "Pro shop"], ["Rental shoes (20 pairs)", "Golf rental equipment", "Pro shop", "Pro shop"], ["Espresso machine La Marzocco", "Café supplies", "Café", "Café"], ["Coffee grinder", "Café supplies", "Café", "Café"], ["Chiller display", "Café supplies", "Café", "Café"], ["Ball dispenser", "Range equipment", "Range", "Range"], ["Range ball picker cart", "Range equipment", "Range", "Range"], ["Hitting mats (20)", "Range equipment", "Range", "Range"]];
  assetDefs.forEach(([name, category, custodian, location], i) => db.assets.push({ id: `AS-${String(i + 1).padStart(3, "0")}`, code: `AST-${String(i + 1).padStart(4, "0")}`, name, category, condition: i % 7 === 0 ? "fair" : "good", custodian, location, status: "available", nextServiceDate: addDays(today, 5 + ((i * 13) % 70)), history: [], purchaseValue: 15000 + ((i * 7919) % 400000) }));
  db.assets[5].status = "maintenance"; db.assets[5].history.push({ at: mkTs(addDays(today, -3), "09:00"), by: "Joel Mercado", text: "Hydraulic hose replacement in progress" }); db.assets[4].nextServiceDate = addDays(today, 2);
  // inventory
  for (const [sku, name, category, price, cost, qty, reorder] of POS_ITEMS) db.inventory.push({ id: nextId(db, "inv", "INV-", 4), sku, name, category, unit: "pc", qty, reorder, cost, price, active: true });
  const supplies: [string, string, InventoryItem["category"], string, number, number, number][] = [["RNG-BALL", "Range balls (pieces)", "range", "pc", 14000, 3000, 2], ["RNT-CLUB", "Rental club sets", "rental", "set", 14, 4, 0], ["SUP-CUP", "Paper cups 12oz", "supply", "pc", 1800, 600, 3], ["SUP-BEAN", "Coffee beans", "supply", "kg", 22, 8, 780], ["SUP-NAP", "Napkins (box)", "supply", "box", 40, 12, 120], ["MNT-FERT", "Greens fertilizer 25-5-10", "maintenance", "bag", 34, 12, 1450], ["MNT-SEED", "Bermuda grass seed", "maintenance", "kg", 55, 20, 380], ["MNT-SAND", "Bunker sand", "maintenance", "cu.m", 18, 6, 2100], ["MNT-DSL", "Diesel fuel", "maintenance", "L", 620, 300, 62], ["MNT-IRR", "Irrigation fittings kit", "maintenance", "kit", 9, 4, 850], ["MNT-HERB", "Selective herbicide", "maintenance", "L", 6, 8, 960]];
  for (const [sku, name, category, unit, qty, reorder, cost] of supplies) db.inventory.push({ id: nextId(db, "inv", "INV-", 4), sku, name, category, unit, qty, reorder, cost, active: true });
  db.inventory.find((i) => i.sku === "SNK-04")!.qty = 11; // low stock demo

  db.recurring = [
    { id: "RC-01", title: "Mow greens (all 18)", category: "Greens", location: "All greens", team: "Greens Crew", everyDays: 1, nextDue: today, estCost: 1800, priority: "normal", active: true },
    { id: "RC-02", title: "Mow fairways", category: "Fairways", location: "Fairways 1-9", team: "Fairway Crew", everyDays: 3, nextDue: addDays(today, 1), estCost: 2400, priority: "normal", active: true },
    { id: "RC-03", title: "Rake & edge bunkers", category: "Bunkers", location: "Hole 1-18 bunkers", team: "Fairway Crew", everyDays: 7, nextDue: addDays(today, 2), estCost: 3200, priority: "low", active: true },
    { id: "RC-04", title: "Irrigation zone check", category: "Irrigation", location: "Pump house", team: "Irrigation Team", everyDays: 7, nextDue: addDays(today, 4), estCost: 1200, priority: "normal", active: true },
    { id: "RC-05", title: "Cart battery & tire check", category: "Golf carts", location: "Cart barn", team: "Cart Maintenance", everyDays: 14, nextDue: addDays(today, 6), estCost: 1500, priority: "normal", active: true },
  ];
  db.announcements = [
    { id: "AN-001", title: "Greens aeration — Hole 3 & 12", at: mkTs(addDays(today, -2), "08:00"), body: "Hole 3 and 12 greens are on temporary greens this week while we complete aeration. Thank you for your understanding.", audience: "all", active: true },
    { id: "AN-002", title: "Members' Night — dinner at the clubhouse", at: mkTs(addDays(today, -4), "10:00"), body: "Members' Night dinner is open for registration at the Membership desk. (Demo announcement)", audience: "members", active: true },
    { id: "AN-003", title: "Cart policy reminder", at: mkTs(addDays(today, -9), "09:00"), body: "Carts must keep to the cart paths on holes 5, 14 and 16 when the fairways are soft.", audience: "all", active: true },
  ];
  db.historicalMonthly = [-5, -4, -3, -2, -1].map((k, i) => { const d = addMonths(today.slice(0, 8) + "01", k); return { month: d.slice(0, 7), revenue: [4980000, 5410000, 5865000, 6120000, 6340000][i], rounds: [2150, 2330, 2480, 2590, 2660][i], members: 910 + i * 40, publicPlayers: [1240, 1300, 1415, 1480, 1520][i] }; });

  /* ------------------------------ simulation ------------------------------ */
  const setNow = (date: string, time: string) => { db.meta.now = mkTs(date, time); };
  const tryDo = <T,>(f: () => T): T | undefined => { try { return f(); } catch (e) { if (e instanceof DomainError) return undefined; throw e; } };
  const GM = as("gm"), RES = as("reservations"), CM = as("caddie_master"), CS = as("cart_supervisor"), ST = as("starter"), CASH = as("cashier"), POSU = as("cafe"), MEM = as("membership"), SUP = as("superintendent"), MX = as("maintenance"), TC = as("tournament");
  const NOW_MIN = toMin(DEMO_NOW_TIME);

  const startDay = (() => { const ms = monthStart(today); const d14 = addDays(today, -14); return ms < d14 ? ms : d14; })();
  const prevMonthStart = monthStart(addDays(monthStart(today), -1));

  // first-of-previous-month dues cycle (so receivables have age)
  setNow(prevMonthStart, "08:00"); Ms.runDuesBilling(db, MEM);
  // work orders: history & open (created before the day loop with explicit clocks)
  function wo(daysAgo: number, loc: string, cat: WorkOrder["category"], desc: string, pri: WorkOrder["priority"], team: string, target: number, est: number, stage: number, hole?: number, inspector = SUP) {
    const d = addDays(today, -daysAgo); setNow(d, "07:30");
    const w = Mt.createWorkOrder(db, SUP, { location: loc, hole, category: cat, description: desc, priority: pri, team, startDate: d, targetDate: addDays(d, target), estCost: est });
    if (stage >= 2) { setNow(d, "08:30"); Mt.advanceWorkOrder(db, MX, w.id, "in_progress"); }
    if (stage >= 2) { const s = db.staff.filter((x) => x.team === team); for (let k = 0; k < Math.min(2, s.length); k++) Mt.logLabor(db, MX, w.id, s[k].id, 4 + k); }
    if (stage >= 3) { setNow(addDays(d, Math.min(target, 1)), "15:00"); Mt.advanceWorkOrder(db, MX, w.id, "for_inspection"); }
    if (stage >= 4) { setNow(addDays(d, Math.min(target, 1)), "16:30"); Mt.inspectWorkOrder(db, inspector, w.id, "passed", "Work satisfactory"); w.actualCost = Math.round(est * (0.85 + rng() * 0.3)); }
    return w;
  }
  const woDefs: [number, string, WorkOrder["category"], string, WorkOrder["priority"], string, number, number, number, number?][] = [
    [13, "Hole 5", "Greens", "Top-dress and roll green", "normal", "Greens Crew", 1, 3500, 4, 5], [12, "Hole 9", "Fairways", "Fairway verti-cut", "normal", "Fairway Crew", 2, 5200, 4, 9], [12, "Hole 11", "Bunkers", "Re-sand greenside bunker", "normal", "Fairway Crew", 2, 7800, 4, 11], [11, "Hole 2", "Tee boxes", "Level and re-turf tee markers area", "low", "Fairway Crew", 3, 4200, 4, 2],
    [10, "Hole 16", "Irrigation", "Replace sprinkler head zone 16B", "high", "Irrigation Team", 1, 5600, 4, 16], [9, "Clubhouse", "Clubhouse exterior", "Repaint entrance railings", "low", "Landscape Crew", 5, 9500, 4], [9, "Hole 7", "Trees & landscaping", "Prune branches over cart path", "normal", "Landscape Crew", 2, 3000, 4, 7], [8, "Hole 13", "Drainage", "Clear fairway drain inlet", "high", "Irrigation Team", 2, 6400, 4, 13],
    [8, "Cart path 10-12", "Pathways", "Patch cart path cracks", "normal", "Landscape Crew", 3, 8800, 4], [7, "Hole 4", "Greens", "Treat dollar-spot patches", "high", "Greens Crew", 2, 6100, 4, 4], [7, "Maintenance shed", "Course equipment", "Service fairway mower (250h)", "normal", "Cart Maintenance", 2, 7200, 4], [6, "Hole 18", "Bunkers", "Edge and rake all bunkers", "low", "Fairway Crew", 1, 2800, 4, 18],
    [5, "Hole 1", "Tee boxes", "Re-level forward tee", "normal", "Fairway Crew", 2, 3600, 4, 1], [5, "Hole 15", "Rough", "Cut back rough along OB line", "low", "Fairway Crew", 2, 3000, 4, 15], [4, "Hole 8", "Greens", "Aerify green", "normal", "Greens Crew", 1, 4500, 4, 8], [4, "Pump house", "Irrigation", "Calibrate irrigation controllers", "normal", "Irrigation Team", 2, 4000, 4],
    [3, "Hole 3", "Greens", "Greens aeration & topdress", "high", "Greens Crew", 3, 9000, 3, 3], [3, "Hole 12", "Greens", "Greens aeration & topdress", "high", "Greens Crew", 3, 9000, 2, 12], [2, "Hole 14", "Irrigation", "Irrigation main leak near fairway — urgent repair", "urgent", "Irrigation Team", 1, 18000, 2, 14], [2, "Hole 10", "Fairways", "Divot refill and seeding", "normal", "Fairway Crew", 3, 3800, 2, 10],
    [1, "Hole 6", "Bunkers", "Wash-out repair after rain", "high", "Fairway Crew", 2, 5400, 1, 6], [1, "Clubhouse", "Clubhouse exterior", "Fix roof gutter leak", "normal", "Landscape Crew", 4, 6800, 1], [1, "Hole 17", "Trees & landscaping", "Remove fallen branch", "normal", "Landscape Crew", 1, 1800, 3, 17], [0, "Hole 9", "Tee boxes", "Replace tee marker set", "low", "", 5, 2500, 0, 9], [0, "Cart barn", "Course equipment", "Replace worn tires on service cart", "normal", "", 4, 6000, 0],
  ];
  for (const d of woDefs) wo(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9]);

  // main day loop
  const hourWeight: Record<number, number> = { 6: 0.62, 7: 0.78, 8: 0.78, 9: 0.62, 10: 0.5, 11: 0.4, 12: 0.22, 13: 0.28, 14: 0.34, 15: 0.2 };
  const publicPool = db.customers.slice(74); const activeMembers = db.members.filter((m) => m.status === "active");
  const memberCust = (m: Member) => db.customers.find((c) => c.id === m.customerId)!;
  const sched: Record<string, { time: string; tee: "1" }[]> = {};
  void sched;

  function makeBookingInput(date: string, time: string, isFuture: boolean) {
    const memberLed = rng() < 0.4; const holes: 9 | 18 = rng() < 0.85 ? 18 : 9;
    if (memberLed) {
      const m = pick(rng, activeMembers); const c = memberCust(m); const n = 1 + Math.floor(rng() * 4);
      const players: Bk.PlayerInput[] = [{ name: c.name, type: "member", memberId: m.id, customerId: c.id }];
      const allowGuests = Math.min(Bk.guestAllowance(db, m.id), n - 1);
      let left = n - 1;
      if (left && rng() < 0.4) { const m2 = pick(rng, activeMembers); if (m2.id !== m.id) { const c2 = memberCust(m2); players.push({ name: c2.name, type: "member", memberId: m2.id, customerId: c2.id }); left--; } }
      for (let g = 0; left > 0 && g < allowGuests; g++, left--) { const gc = pick(rng, publicPool); if (!players.some((p) => p.customerId === gc.id)) players.push({ name: gc.name, type: "guest", sponsorId: m.id, customerId: gc.id }); }
      return { date, time, holes, channel: "member" as const, players, contactName: c.name, contactPhone: c.phone, contactCustomerId: c.id, contactMemberId: m.id, notes: "" };
    }
    const c = pick(rng, publicPool); const n = 1 + Math.floor(rng() * 4); const players: Bk.PlayerInput[] = [{ name: c.name, type: "public", customerId: c.id }];
    for (let i = 1; i < n; i++) { const o = pick(rng, publicPool); if (!players.some((p) => p.customerId === o.id)) players.push({ name: o.name, type: "public", customerId: o.id }); }
    const ch = pick(rng, ["phone", "phone", "online", "walk_in", "staff"] as const);
    return { date, time, holes, channel: ch, players, contactName: c.name, contactPhone: c.phone, contactCustomerId: c.id, notes: rng() < 0.1 ? "Birthday group — please arrange cake at halfway house." : "" };
  }

  const payMix = () => { const r = rng(); return r < 0.55 ? "cash" as const : r < 0.8 ? "gcash" as const : "card" as const; };
  function payCounter(bookingId: string, ctx: Ctx, prob = 1) {
    for (const c of db.charges.filter((x) => x.bookingId === bookingId && x.billTo === "counter" && Fn.outstanding(x) > 0)) if (rng() < prob) tryDo(() => Fn.recordPayment(db, ctx, { chargeId: c.id, amount: Fn.outstanding(c), method: payMix() }));
  }
  let curDate = ""; function pickCart(avoid12: boolean) { const out = new Set([...(avoid12 ? [12] : []), ...(curDate >= addDays(today, -1) ? [7, 22, 30] : [])]); const av = db.carts.filter((c) => c.status === "available" && !out.has(c.no)); return av.length ? pick(rng, av) : undefined; }

  function runBooking(b: ReturnType<typeof Bk.createBooking>, date: string, isToday: boolean) {
    const tee = toMin(b.time); const dur = b.holes === 18 ? 255 + Math.floor(rng() * 40) : 120 + Math.floor(rng() * 25);
    const jitter = rng() < 0.08 ? 12 + Math.floor(rng() * 8) : Math.floor(rng() * 7);
    const startM = tee + jitter, endM = startM + dur;
    let stage = 4;
    if (isToday) stage = NOW_MIN >= endM ? 4 : NOW_MIN >= startM ? 3 : NOW_MIN >= tee - 12 ? 2 : NOW_MIN >= tee - 35 ? 1 : 0;
    const delayedHere = isToday && stage <= 3 && tee < NOW_MIN - 8 && tee > NOW_MIN - 40; // late, not yet released
    if (delayedHere) stage = Math.min(stage, 2);
    if (isToday && stage === 0 && tee < NOW_MIN + 5) stage = 1;
    // leave a few "no-show" flights in the past
    if (!isToday && rng() < 0.04) { setNow(date, fromMin(tee + 25)); tryDo(() => Bk.markNoShow(db, RES, b.id)); return; }
    if (isToday && tee < NOW_MIN - 45 && stage < 3) { setNow(date, fromMin(Math.min(NOW_MIN, tee + 30))); tryDo(() => Bk.markNoShow(db, RES, b.id)); return; }
    if (stage === 0) { if (rng() < 0.35 && Cd.rotationQueue(db).length) { setNow(date, "08:20"); tryDo(() => Cd.assignCaddie(db, CM, { bookingId: b.id })); } return; }
    setNow(date, fromMin(Math.max(300, Math.min(isToday ? NOW_MIN : 1e9, tee - 32)))); tryDo(() => Fl.arriveBooking(db, ST, b.id, b.players.map((p) => p.id)));
    if (db.bookings.find((x) => x.id === b.id)!.status !== "arrived") return;
    if (stage === 1 && rng() < 0.6) return; // arrived, nothing else yet
    // caddies
    const need = Cd.requiredCaddies(db, b.id); const t0 = Math.min(isToday ? NOW_MIN : 1e9, tee - 24);
    for (let k = 0; k < need; k++) {
      setNow(date, fromMin(t0)); const r = rng();
      if (r < 0.1) { const c = pick(rng, Cd.rotationQueue(db).slice(1, 6)); if (c) { tryDo(() => Cd.assignCaddie(db, CM, { bookingId: b.id, caddieId: c.id, preferred: true, reason: "Requested by golfer" })); continue; } }
      if (r < 0.14) { const c = pick(rng, Cd.rotationQueue(db).slice(1, 4)); if (c) { tryDo(() => Cd.assignCaddie(db, CM, { bookingId: b.id, caddieId: c.id, reason: "Rotation skipped: queued caddie on meal break" })); continue; } }
      tryDo(() => Cd.assignCaddie(db, CM, { bookingId: b.id }));
    }
    // carts
    const ncart = Ct.requiredCarts(db, b.id);
    for (let k = 0; k < ncart; k++) { setNow(date, fromMin(t0 + 2)); const c = pickCart(isToday); if (c) tryDo(() => Ct.assignCart(db, CS, b.id, c.id)); }
    setNow(date, fromMin(t0 + 8)); payCounter(b.id, CASH, !isToday || stage >= 3 ? 1 : 0.85);
    if (stage === 1) return;
    for (const c of Ct.cartsFor(db, b.id)) { setNow(date, fromMin(tee - 10)); tryDo(() => Ct.dispatchCart(db, CS, c.id)); }
    setNow(date, fromMin(tee - 6)); const ok = tryDo(() => { Fl.markReady(db, ST, b.id); return true; });
    if (!ok) return; if (stage === 2) return;
    setNow(date, fromMin(startM)); tryDo(() => Fl.startRound(db, ST, b.id));
    if (db.bookings.find((x) => x.id === b.id)!.status !== "started") return;
    if (rng() < 0.06) tryDo(() => Fl.recordIncident(db, ST, b.id, "slow_play", "Group ahead holding up play on the back nine."));
    const half = Math.max(1, Math.floor(b.holes / 2)); const cpAt = startM + Math.round((dur / b.holes) * half) + (rng() < 0.2 ? 14 : Math.floor(rng() * 8) - 3);
    if (!isToday || NOW_MIN >= cpAt) { setNow(date, fromMin(cpAt)); tryDo(() => Fl.recordCheckpoint(db, ST, b.id, half)); }
    if (stage === 3) return;
    setNow(date, fromMin(endM)); const extras: Record<string, { tip?: number }> = {};
    for (const a of db.caddieAssignments.filter((x) => x.bookingId === b.id && x.status === "on_course")) if (rng() < 0.55) extras[a.id] = { tip: 100 + 50 * Math.floor(rng() * 4) };
    tryDo(() => Fl.completeRound(db, ST, b.id, extras));
    setNow(date, fromMin(endM + 6)); payCounter(b.id, CASH, isToday ? 0.9 : 0.96);
    for (const c of db.caddies.filter((x) => x.status === "returned")) tryDo(() => Cd.releaseToQueue(db, CM, c.id));
    for (const c of db.carts.filter((x) => x.status === "returned")) { if (isToday && rng() < 0.3) continue; tryDo(() => Ct.startInspection(db, CS, c.id)); tryDo(() => Ct.passInspection(db, CS, c.id)); }
  }

  const days: string[] = []; for (let d = startDay; d <= today; d = addDays(d, 1)) days.push(d);
  const pastEvents = [{ name: "Saturday Stableford Mug", type: "tournament" as const, off: 9, fee: 1800, n: 22, fmt: "Gross stroke play (demo scoring)" }, { name: "Meridian Bank Client Golf Day", type: "corporate" as const, off: 4, fee: 3200, n: 16, fmt: "Scramble — 4-person teams" }];
  void pastEvents;
  const gridT = Bk.gridTimes(db);

  days.forEach((date, di) => {
    const isToday = date === today; curDate = date; setNow(date, "05:20");
    if (date.slice(8) === "01" && date !== prevMonthStart) Ms.runDuesBilling(db, MEM);
    Fn.openShiftFor(db, CASH, 5000);
    // caddie attendance
    const presentIdx = new Set<number>(); const target = 26 + Math.floor(rng() * 6); while (presentIdx.size < target) presentIdx.add(Math.floor(rng() * 45));
    db.caddies.forEach((c, i) => {
      if (presentIdx.has(i)) { setNow(date, fromMin(5 * 60 + 25 + Math.floor(rng() * 70))); Cd.caddieCheckIn(db, CM, c.id); }
      else { const st = rng() < 0.6 ? "day_off" : "absent"; setNow(date, "06:00"); Cd.setCaddieStatus(db, CM, c.id, st as "day_off" | "absent"); c.status = "off"; }
    });
    setNow(date, "05:50");
    // generate bookings
    const wk = [0, 6].includes(dow(date)) ? 1.15 : 0.82; const picks: { time: string }[] = [];
    for (const t of gridT) { const h = Math.floor(toMin(t) / 60); if (rng() < (hourWeight[h] ?? 0.2) * wk * 0.55) picks.push({ time: t }); }
    if (isToday) for (const t of ["08:40", "09:20", "09:40", "10:10"]) if (gridT.includes(t)) { const ex = picks.find((x) => x.time === t); if (ex) (ex as { force?: boolean }).force = true; else picks.push({ time: t, force: true } as { time: string }); } // guaranteed demo states: a delayed flight and upcoming arrivals
    picks.sort((a, b) => a.time.localeCompare(b.time));
    let started = 0;
    const created: { b: ReturnType<typeof Bk.createBooking>; cancel: boolean }[] = [];
    const prior = addDays(date, -1);
    picks.forEach((p, i) => {
      if (isToday && toMin(p.time) < NOW_MIN && toMin(p.time) > 6 * 60 + 60 && started > 9 && !(p as { force?: boolean }).force) return;
      if (isToday && toMin(p.time) < NOW_MIN && toMin(p.time) >= 6 * 60) started++;
      setNow(prior, fromMin(9 * 60 + i * 7)); let b: ReturnType<typeof Bk.createBooking> | undefined;
      for (let attempt = 0; attempt < ((p as { force?: boolean }).force ? 12 : 1) && !b; attempt++) { const input = makeBookingInput(date, p.time, false); b = tryDo(() => Bk.createBooking(db, RES, { ...input, override: true })); }
      if (!b) return; if (b.status === "booked") { setNow(prior, fromMin(9 * 60 + i * 7 + 3)); Bk.confirmBooking(db, RES, b.id); }
      created.push({ b, cancel: rng() < 0.07 });
    });
    created.sort((a, b) => a.b.time.localeCompare(b.b.time));
    for (const { b, cancel } of created) {
      if (cancel) { setNow(date, "05:30"); tryDo(() => Bk.cancelBooking(db, RES, b.id, pick(rng, ["Change of plans", "Weather concern", "Group size changed"]))); continue; }
      runBooking(b, date, isToday);
    }
    if (!isToday) { // safety net: no historical flight may be left half-processed
      setNow(date, "16:30");
      for (const b of db.bookings.filter((x) => x.date === date && ["arrived", "ready", "started"].includes(x.status))) {
        if (b.status === "arrived") tryDo(() => Fl.markReady(db, ST, b.id, "Seed waiver"));
        if (db.bookings.find((x) => x.id === b.id)!.status === "ready") tryDo(() => Fl.startRound(db, ST, b.id));
        tryDo(() => Fl.completeRound(db, ST, b.id));
        if (!["completed"].includes(db.bookings.find((x) => x.id === b.id)!.status)) throw new Error("seed: could not finish " + b.ref + " " + b.status);
      }
      for (const c of db.caddies.filter((x) => x.status === "returned")) tryDo(() => Cd.releaseToQueue(db, CM, c.id));
    }
    // member-balance collections on certain days
    if (!isToday && [1, 4].includes(dow(date))) {
      setNow(date, "14:00");
      for (const m of db.members) { const bal = Fn.memberBalance(db, m.id); const old = db.charges.some((c) => c.memberId === m.id && Fn.outstanding(c) > 0 && diffDays(date, c.date) >= 9); if (bal > 0 && old && rng() < 0.55 && m.status !== "suspended") tryDo(() => Fn.payMemberBalance(db, CASH, m.id, bal, pick(rng, ["cash", "gcash", "bank_transfer", "card"] as const))); }
    }
    // café + range sales
    const nCafe = isToday ? 9 : 16 + Math.floor(rng() * 16); const nRange = isToday ? 7 : 10 + Math.floor(rng() * 14);
    const menu = db.inventory.filter((i) => i.price != null);
    for (let k = 0; k < nCafe; k++) {
      const mins = isToday ? 6 * 60 + Math.floor((k / nCafe) * (NOW_MIN - 6 * 60 - 5)) : 6 * 60 + 20 + Math.floor((k / nCafe) * 640); setNow(date, fromMin(mins));
      const items: { itemId: string; qty: number }[] = []; for (let j = 0; j < 1 + Math.floor(rng() * 3); j++) { const it = pick(rng, menu); if (!items.some((x) => x.itemId === it.id)) items.push({ itemId: it.id, qty: 1 + Math.floor(rng() * 2) }); }
      const useMember = rng() < 0.28; const m = useMember ? pick(rng, activeMembers) : undefined; let method: Pos.PayMethod = m && rng() < 0.7 ? "member_account" : payMix();
      const o = tryDo(() => Pos.createPosOrder(db, POSU, { items, method, memberId: m?.id }));
      if (!o && method === "member_account") tryDo(() => Pos.createPosOrder(db, POSU, { items, method: "cash", memberId: m?.id }));
      const last = db.posOrders[db.posOrders.length - 1]; if (last && last.date === date) last.fulfil = isToday && k > nCafe - 3 ? "preparing" : "served";
    }
    if (!isToday && di % 6 === 2) { const last = db.posOrders.filter((o) => o.date === date && o.fulfil !== "void").pop(); if (last) { setNow(date, "16:40"); tryDo(() => Pos.voidPosOrder(db, POSU, last.id, "Customer cancelled order")); } }
    for (let k = 0; k < nRange; k++) {
      const mins = isToday ? 6 * 60 + Math.floor((k / nRange) * (NOW_MIN - 6 * 60 - 3)) : 6 * 60 + 10 + Math.floor((k / nRange) * 640); setNow(date, fromMin(mins));
      const useMember = rng() < 0.3; const m = useMember ? pick(rng, activeMembers) : undefined; const c = pick(rng, publicPool); const bucket = pick(rng, ["BKT-S", "BKT-M", "BKT-L"]);
      const items = [{ code: bucket, qty: 1 }]; let bay: number | undefined; if (rng() < 0.25) { items.push({ code: "SES-30", qty: 1 + Math.floor(rng() * 2) }); bay = 1 + Math.floor(rng() * 20); }
      if (rng() < 0.08) items.push({ code: "CLUB", qty: 1 });
      const method: Pos.PayMethod = m && rng() < 0.5 ? "member_account" : payMix();
      const s = tryDo(() => Pos.sellRange(db, POSU, { items, name: c.name, memberId: m?.id, bay, method })) ?? tryDo(() => Pos.sellRange(db, POSU, { items: [{ code: bucket, qty: 1 }], name: c.name, method: "cash" }));
      if (s && !isToday) s.ended = true;
    }
    // events & membership workflow items
    pastEvents.forEach((pe) => { if (date === addDays(today, -pe.off) && !isToday) {
      setNow(date, "05:45"); const { event } = Ev.createEvent(db, TC, { name: pe.name, type: pe.type, date, start: "07:00", end: "13:30", organizer: pe.type === "corporate" ? "Meridian Bank (fictional)" : "Sierra Verde Golf Committee", expected: pe.n + 4, fee: pe.fee, venue: "18-hole course + clubhouse", format: pe.fmt, blockTeeSheet: false });
      const pool = shuffle(db.customers).slice(0, pe.n); setNow(date, "06:30");
      pool.forEach((c) => tryDo(() => Ev.registerPlayer(db, TC, event.id, { name: c.name, customerId: c.id, memberId: c.memberId && db.members.find((m) => m.id === c.memberId)?.status === "active" ? c.memberId : undefined, payMethod: rng() < 0.85 ? payMix() : undefined })));
      Ev.assignFlights(db, TC, event.id); Ev.addCatering(db, TC, event.id, "Boxed lunch", pe.n, pe.n * 280); Ev.confirmCatering(db, TC, event.id, event.catering[0].id);
      setNow(date, "13:00"); for (const r of event.registrations) Ev.recordScore(db, TC, event.id, r.id, 74 + Math.floor(rng() * 28)); Ev.setEventStatus(db, TC, event.id, "completed");
    } });
    // settle older caddie payables and end the day
    if (!isToday) {
      setNow(date, "17:00");
      for (const s of db.caddieSettlements.filter((x) => x.status === "pending" && x.date < addDays(date, -1))) tryDo(() => Cd.settleCaddie(db, CM, s.id));
      for (const c of db.caddies) if (c.status === "available" || c.status === "returned") { if (c.status === "returned") Cd.releaseToQueue(db, CM, c.id); tryDo(() => Cd.caddieCheckOut(db, CM, c.id)); }
      for (const c of db.caddies) if (c.status === "unavailable") c.status = "off";
      setNow(date, "18:00"); const sh = db.shifts[db.shifts.length - 1]; const exp = Fn.shiftCash(db, sh.id).expected; const v = di % 5 === 3 ? -100 : di % 7 === 5 ? 50 : 0;
      Fn.closeShift(db, CASH, sh.id, exp + v, v ? "Minor counting variance noted by cashier" : undefined);
    }
  });

  // membership pipeline examples (today)
  setNow(today, "08:10");

  // carts out of service for demonstration
  setNow(addDays(today, -1), "16:00"); const cart7 = db.carts.find((c) => c.no === 7)!; Ct.reportCartIssue(db, CS, cart7.id, "Brake pedal sticking; reduced stopping power", "high");
  const w7 = db.workOrders[db.workOrders.length - 1]; setNow(today, "07:20"); Mt.advanceWorkOrder(db, MX, w7.id, "in_progress");
  setNow(today, "07:40"); const cart22 = db.carts.find((c) => c.no === 22)!; Ct.reportCartIssue(db, CS, cart22.id, "Battery pack not holding charge", "normal");
  const cart30 = db.carts.find((c) => c.no === 30)!; if (cart30.status === "available") { cart30.status = "returned"; Ct.startInspection(db, CS, cart30.id); }

  // today's seed restriction (advisory) + upcoming events
  setNow(today, "08:15"); tryDo(() => Bk.createClosure(db, SUP, { date: today, from: "10:00", to: "15:30", type: "partial", tee: "1", holes: [14], category: "maintenance", reason: "Hole 14 irrigation repair — play to temporary green", workOrderId: db.workOrders.find((w) => w.priority === "urgent")?.id }));
  // a lifted historical closure for audit history
  setNow(addDays(today, -5), "06:00"); const hc = tryDo(() => Bk.createClosure(db, SUP, { date: addDays(today, -5), from: "06:00", to: "09:00", type: "full", tee: "all", holes: [], category: "weather", reason: "Lightning warning — morning suspension" })); setNow(addDays(today, -5), "09:05"); if (hc) Bk.liftClosure(db, SUP, hc.closure.id);

  setNow(today, "08:30");
  const upcoming = [{ name: "Sierra Verde Founders' Cup", type: "tournament" as const, off: 9, fee: 3500, n: 34, exp: 52, fmt: "Gross stroke play (demo scoring)", block: true }, { name: "Corporate Golf Day — Meridian Bank", type: "corporate" as const, off: 16, fee: 3200, n: 18, exp: 40, fmt: "Scramble — 4-person teams", block: true }, { name: "Charity Scramble for Scholars", type: "charity" as const, off: 23, fee: 2800, n: 9, exp: 60, fmt: "Scramble", block: true }, { name: "Members' Night Dinner", type: "social" as const, off: 12, fee: 1500, n: 21, exp: 80, fmt: "Dinner at the clubhouse", block: false }];
  for (const u of upcoming) {
    const d = addDays(today, u.off); const { event } = Ev.createEvent(db, TC, { name: u.name, type: u.type, date: d, start: u.type === "social" ? "18:00" : "06:30", end: u.type === "social" ? "22:00" : "12:30", organizer: u.type === "corporate" ? "Meridian Bank (fictional)" : "Sierra Verde Golf Committee", expected: u.exp, fee: u.fee, venue: u.type === "social" ? "Clubhouse ballroom" : "18-hole course", format: u.fmt, blockTeeSheet: u.block });
    shuffle(db.customers).slice(0, u.n).forEach((c) => tryDo(() => Ev.registerPlayer(db, TC, event.id, { name: c.name, customerId: c.id, payMethod: rng() < 0.55 ? payMix() : undefined })));
    if (u.type === "tournament") Ev.assignFlights(db, TC, event.id);
    event.resources.push({ id: nextId(db, "resource", "RS-", 4), text: "Starter table & scoreboard", done: true }, { id: nextId(db, "resource", "RS-", 4), text: `${Math.ceil(u.n / 2)} golf carts blocked`, done: false });
    if (u.type !== "social") Ev.addCatering(db, TC, event.id, "Lunch buffet", u.n, u.n * 450);
  }
  // future bookings (next 7 days; a couple of member bookings further out)
  setNow(today, "08:58");
  for (let k = 1; k <= 7; k++) {
    const date = addDays(today, k); const wk = [0, 6].includes(dow(date)) ? 1.15 : 0.85;
    for (const t of gridT) { const h = Math.floor(toMin(t) / 60); if (rng() < (hourWeight[h] ?? 0.2) * wk * 0.42) {
      const input = makeBookingInput(date, t, true); const dep = input.contactMemberId === undefined && rng() < 0.18;
      const b = tryDo(() => Bk.createBooking(db, RES, { ...input, depositAmount: dep ? 500 * input.players.length : undefined, depositMethod: "gcash" }));
      if (b && b.status === "booked" && rng() < 0.7) Bk.confirmBooking(db, RES, b.id);
    } }
  }
  for (const k of [10, 12]) { const date = addDays(today, k); for (const t of ["07:00", "07:30", "08:10"]) { const input = makeBookingInput(date, t, true); if (input.contactMemberId) tryDo(() => Bk.createBooking(db, RES, input)); } }
  // waitlist
  const wl = [["Rowena Castillo", addDays(today, 1), "07:00", "08:30", 4], ["Alvin Navarro", addDays(today, 2), "08:00", "10:00", 2], ["Divina Salazar", addDays(today, 1), "11:00", "13:00", 3]] as const;
  wl.forEach(([name, date, from, to, players]) => { const c = db.customers.find((x) => x.name === name); Bk.addWaitlist(db, RES, { date, from, to, players, name, phone: c?.phone ?? "09171234567", customerId: c?.id }); });

  // feedback
  const fb: [number, string][] = [[5, "Great course conditions, caddie was excellent!"], [4, "Pace of play was good. Café was a bit slow."], [5, "Beautiful greens. Will book again."], [3, "Carts were not ready at 7AM."], [4, "Friendly staff at the starter."], [5, "Loved the Saturday mug event."]];
  fb.forEach(([rating, text], i) => { const c = db.customers[80 + i]; db.feedback.push({ id: `FB-${i + 1}`, at: mkTs(addDays(today, -i - 1), "18:00"), customerId: c.id, name: c.name, rating, text }); });

  // running range tabs (unbilled): golfers still practising at the demo time
  setNow(today, "08:20");
  const freeBay = () => { const o = Pos.bayOccupancy(db); return Array.from({ length: Pos.RANGE_BAYS }, (_, i) => i + 1).find((b) => !o[b]); };
  const tabMember = activeMembers[12]; const tm = tryDo(() => Pos.openRangeTab(db, POSU, { memberId: tabMember.id, bay: freeBay() }));
  if (tm) { setNow(today, "08:22"); tryDo(() => Pos.addRangeLine(db, POSU, tm.id, "BKT-M", 1)); setNow(today, "08:48"); tryDo(() => Pos.addRangeLine(db, POSU, tm.id, "BKT-S", 2)); }
  const tp = tryDo(() => Pos.openRangeTab(db, POSU, { name: db.customers[100].name, bay: freeBay() }));
  if (tp) { setNow(today, "08:35"); tryDo(() => Pos.addRangeLine(db, POSU, tp.id, "BKT-L", 1)); tryDo(() => Pos.addRangeLine(db, POSU, tp.id, "CLUB", 1)); }
  // running café tabs (unbilled)
  setNow(today, "08:25"); const ct1 = tryDo(() => Pos.openCafeTab(db, POSU, { memberId: tabMember.id })); if (ct1 && tm) Pos.linkTabs(db, POSU, tm.id, ct1.id);
  const sku = (k: string) => db.inventory.find((x) => x.sku === k)!.id;
  if (ct1) { tryDo(() => Pos.addCafeLine(db, POSU, ct1.id, sku("COF-03"), 2)); setNow(today, "08:50"); tryDo(() => Pos.addCafeLine(db, POSU, ct1.id, sku("SNK-02"), 1)); ct1.lines[0].fulfil = "served"; }
  setNow(today, "08:40"); const ct2 = tryDo(() => Pos.openCafeTab(db, POSU, { label: "Table 4 — Reyes group" }));
  if (ct2) { tryDo(() => Pos.addCafeLine(db, POSU, ct2.id, sku("MEL-03"), 2)); tryDo(() => Pos.addCafeLine(db, POSU, ct2.id, sku("BEV-04"), 4)); ct2.lines[0].fulfil = "preparing"; }
  // pending cashier items: one older unpaid public charge + one pending event
  setNow(today, DEMO_NOW_TIME);
  db.meta.today = today; db.meta.now = mkTs(today, DEMO_NOW_TIME);
  db.audit = db.audit.slice(-2500);
  return db;
}

export { SYSTEM };
