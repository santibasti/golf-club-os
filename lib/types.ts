/**
 * Golf Club OS — domain model.
 * All dates are club-local ("Asia/Manila") strings: dates 'YYYY-MM-DD', times 'HH:MM',
 * timestamps 'YYYY-MM-DDTHH:MM'. Every record carries `clubId` implicitly through the DB root (tenant).
 * See docs/DATA_MODEL.md and docs/schema.sql for the PostgreSQL mapping.
 */

export type RoleId =
  | "system_admin" | "owner" | "gm" | "golf_ops" | "membership" | "reservations" | "caddie_master"
  | "starter" | "cart_supervisor" | "superintendent" | "maintenance" | "cashier" | "cafe" | "tournament" | "member";

export type Permission = string;

export type PlayerType = "member" | "guest" | "public";
export type DayType = "weekday" | "weekend" | "holiday";
export type Tee = "1" | "10";

export type BookingStatus = "booked" | "confirmed" | "arrived" | "ready" | "started" | "completed" | "cancelled" | "no_show";
export type Channel = "phone" | "walk_in" | "online" | "member" | "staff" | "event";

export interface Customer {
  id: string; name: string; phone: string; email: string; address: string; birthDate: string;
  memberId?: string; createdAt: string; notes?: string;
}

export interface MembershipPlan {
  id: string; name: string; description: string; active: boolean;
  joiningFee: number; annualDues: number; billingCycle: "monthly" | "quarterly" | "annual" | "none";
  greenFee18: number; greenFee9: number; guestsPerRound: number; guestRate18: number;
  advanceDays: number; priorityAccess: boolean; cartDiscountPct: number; rangeDiscountPct: number;
  cafeDiscountPct: number; accountCharging: boolean; creditLimit: number; termMonths: number | null; // null = no expiry
}

export type MemberStatus = "applicant" | "pending_approval" | "active" | "suspended" | "expired" | "cancelled";
export interface Member {
  id: string; customerId: string; planId: string; status: MemberStatus;
  applicationDate: string; activationDate?: string; expiryDate?: string;
  emergencyContact: { name: string; phone: string; relation: string };
  billingPref: "account" | "counter"; nextBillingDate?: string;
  docs: Record<string, boolean>; notes?: string; colorSeed: number;
  history: { at: string; by: string; text: string }[];
  guestLimitOverride?: number;
}

export interface Sponsorship { id: string; memberId: string; guestName: string; guestCustomerId?: string; bookingId: string; date: string; fee: number }

export interface BookingPlayer {
  id: string; name: string; type: PlayerType; customerId?: string; memberId?: string; sponsorId?: string;
  rate: number; rateLabel: string; checkedIn: boolean;
}
export interface Deposit { amount: number; method: PaymentMethod; paymentId: string; status: "held" | "applied" | "refunded" | "forfeited" }
export interface Booking {
  id: string; ref: string; date: string; time: string; tee: Tee; holes: 9 | 18; channel: Channel; status: BookingStatus;
  players: BookingPlayer[]; contactName: string; contactPhone: string; contactCustomerId?: string; contactMemberId?: string;
  notes: string; deposit?: Deposit; eventId?: string; noCaddie?: boolean; preferredCaddieId?: string;
  createdAt: string; createdBy: string; history: { at: string; by: string; text: string }[];
  cancelledAt?: string; cancelReason?: string; lateCancel?: boolean; noShowAt?: string; greenFeeTotal: number;
  flightNo?: number; rescheduledFrom?: string; confirmedAt?: string;
}

export interface Round {
  id: string; bookingId: string; date: string; flightNo: number; arrivedAt: string; readyAt?: string; startedAt?: string;
  finishedAt?: string; delay?: { reason: string; at: string }; suspended?: { reason: string; at: string } | null;
  checkpoints: { id: string; hole: number; at: string; expectedAt: string; note?: string }[];
  incidents: { id: string; type: IncidentType; note: string; at: string; by: string }[];
  requirementsWaived?: string;
}
export type IncidentType = "slow_play" | "obstruction" | "weather" | "safety" | "course_condition";

export type CaddieClass = "employee" | "contractor" | "freelance";
export type CaddieStatus = "off" | "available" | "reserved" | "assigned" | "on_course" | "returned" | "unavailable" | "absent" | "day_off";
export interface Caddie {
  id: string; name: string; phone: string; classification: CaddieClass; category: "A" | "B" | "C"; priority: number;
  status: CaddieStatus; lastReleasedAt?: string; unavailableReason?: string; notes: string; colorSeed: number;
  incidents: { id: string; at: string; severity: "minor" | "major"; text: string; by: string }[];
  baseRounds: number; // completed rounds before the demo window (history)
  baseFees: number;
}
export interface CaddieAttendance { id: string; caddieId: string; date: string; timeIn?: string; timeOut?: string; status: "present" | "absent" | "day_off" | "late" }
export interface RotationEvent { id: string; at: string; caddieId: string; bookingId?: string; type: "auto" | "preferred" | "override" | "replace" | "unavailable" | "release"; reason?: string; by: string; expectedCaddieId?: string }
export interface CaddieAssignment {
  id: string; caddieId: string; bookingId: string; date: string; status: "reserved" | "assigned" | "on_course" | "completed" | "replaced" | "cancelled";
  fee: number; special: number; extra: number; tip: number; createdAt: string; startedAt?: string; completedAt?: string;
  chargeId?: string; settlementId?: string; note?: string;
}
export interface CaddieSettlement { id: string; caddieId: string; assignmentId: string; date: string; gross: number; payable: number; clubRetained: number; status: "pending" | "settled"; settledAt?: string; settledBy?: string; chargeId: string }

export type CartStatus = "available" | "reserved" | "dispatched" | "in_use" | "returned" | "inspection" | "maintenance";
export interface Cart {
  id: string; no: number; type: "2-seater" | "4-seater"; seats: number; fuel: "electric" | "gas"; condition: "excellent" | "good" | "fair" | "poor";
  battery: number; status: CartStatus; bookingId?: string; staff?: string; dispatchedAt?: string; returnedAt?: string;
  history: { at: string; by: string; text: string }[]; damage?: string;
}
export interface CartDispatch { id: string; cartId: string; bookingId: string; date: string; reservedAt: string; dispatchedAt?: string; returnedAt?: string; staff?: string; fee: number; chargeId?: string; damage?: string; status: "reserved" | "dispatched" | "returned" | "cancelled" }

export interface Closure {
  id: string; date: string; from: string; to: string; type: "full" | "partial" | "tee"; tee: Tee | "all"; holes: number[];
  category: "maintenance" | "tournament" | "weather" | "other"; reason: string; active: boolean;
  createdBy: string; createdAt: string; liftedAt?: string; liftedBy?: string; workOrderId?: string; eventId?: string;
}

export type WorkStatus = "scheduled" | "assigned" | "in_progress" | "for_inspection" | "completed";
export type MaintCategory = "Greens" | "Fairways" | "Tee boxes" | "Bunkers" | "Rough" | "Irrigation" | "Drainage" | "Trees & landscaping" | "Pathways" | "Clubhouse exterior" | "Course equipment" | "Golf carts";
export interface WorkOrder {
  id: string; code: string; location: string; hole?: number; category: MaintCategory; description: string;
  priority: "low" | "normal" | "high" | "urgent"; team: string; status: WorkStatus; startDate: string; targetDate: string; completedAt?: string;
  estCost: number; actualCost: number; notes: { at: string; by: string; text: string }[]; assetId?: string; cartId?: string; recurringId?: string;
  labor: { id: string; staffId: string; date: string; hours: number }[]; materials: { itemId: string; qty: number; cost: number }[];
  inspections: { at: string; by: string; result: "passed" | "failed"; note: string }[]; createdBy: string; createdAt: string; closureId?: string;
}
export interface RecurringTask { id: string; title: string; category: MaintCategory; location: string; team: string; everyDays: number; nextDue: string; estCost: number; priority: WorkOrder["priority"]; active: boolean }
export interface Hole { no: number; par: number; yards: number; si: number; condition: "excellent" | "good" | "fair" | "poor"; team: string }
export interface Staff { id: string; name: string; department: string; title: string; team?: string; phone: string; active: boolean }

export type AssetCategory = "Golf carts" | "Maintenance machines" | "Course equipment" | "Tools" | "Golf rental equipment" | "Café supplies" | "Range equipment";
export interface Asset { id: string; code: string; name: string; category: AssetCategory; condition: Cart["condition"]; custodian: string; location: string; status: "available" | "in_use" | "maintenance" | "retired"; nextServiceDate?: string; history: { at: string; by: string; text: string }[]; cartId?: string; purchaseValue: number }
export interface InventoryItem { id: string; sku: string; name: string; category: "beverage" | "coffee" | "meal" | "snack" | "refreshment" | "range" | "rental" | "supply" | "maintenance"; unit: string; qty: number; reorder: number; cost: number; price?: number; active: boolean }
export interface InventoryMovement { id: string; itemId: string; at: string; type: "sale" | "receive" | "adjust" | "void_return" | "consume"; qty: number; ref?: string; by: string; note?: string }

export interface PosOrder {
  id: string; no: string; at: string; date: string; items: { itemId: string; name: string; qty: number; price: number }[];
  subtotal: number; discountPct: number; discount: number; total: number; method: PaymentMethod | "member_account"; fulfil: "new" | "preparing" | "served" | "void";
  memberId?: string; customerName: string; chargeId: string; cashier: string; note?: string; voided?: { at: string; by: string; reason: string };
}
export interface RangeSale { id: string; at: string; date: string; customerId?: string; memberId?: string; name: string; items: { code: string; name: string; qty: number; price: number }[]; bay?: number; minutes?: number; endsAt?: string; ended?: boolean; amount: number; discount: number; chargeId: string; method: PaymentMethod | "member_account" }

/** Running range tab: items accumulate while the player practises; ONE charge + payment is created at bill-out. */
export interface RangeTab {
  id: string; no: string; openedAt: string; name: string; customerId?: string; memberId?: string; bay?: number; status: "open" | "billed" | "cancelled";
  lines: { id: string; code: string; name: string; qty: number; price: number; at: string; minutes?: number; balls?: number }[];
  billedAt?: string; chargeId?: string; saleId?: string; method?: PaymentMethod | "member_account"; total?: number; discount?: number;
}
/** Running café tab (table or golfer): lines accumulate and are sent to the kitchen; ONE charge + payment at bill-out. */
export interface CafeTab {
  id: string; no: string; openedAt: string; label: string; customerId?: string; memberId?: string; status: "open" | "billed" | "cancelled";
  lines: { id: string; itemId: string; name: string; qty: number; price: number; at: string; fulfil: "new" | "preparing" | "served" }[];
  billedAt?: string; orderId?: string; chargeId?: string; method?: PaymentMethod | "member_account"; total?: number;
}
export type PaymentMethod = "cash" | "card" | "gcash" | "bank_transfer";
export type Dept = "green" | "cart" | "caddie" | "membership" | "cafe" | "range" | "event" | "other";
export type ChargeStatus = "unpaid" | "partial" | "paid" | "refunded" | "written_off" | "voided";
export interface Charge {
  id: string; no: string; date: string; createdAt: string; dept: Dept; description: string; customerId?: string; memberId?: string; name: string;
  bookingId?: string; refType?: string; refId?: string; amount: number; discount: number; discountReason?: string; paid: number; refunded: number;
  payable: number; payableToCaddieId?: string; status: ChargeStatus; billTo: "counter" | "member_account"; reason?: string;
  history: { at: string; by: string; text: string }[]; billingKey?: string;
}
export interface Payment { id: string; no: string; date: string; at: string; chargeId?: string; customerId?: string; memberId?: string; name: string; amount: number; method: PaymentMethod; ref?: string; shiftId: string; receivedBy: string; kind: "payment" | "deposit"; bookingId?: string }
export interface Refund { id: string; date: string; at: string; chargeId?: string; paymentId?: string; amount: number; method: PaymentMethod; reason: string; approvedBy: string; shiftId: string }
export interface Shift { id: string; date: string; cashier: string; openedAt: string; closedAt?: string; openingFloat: number; expectedCash?: number; countedCash?: number; variance?: number; status: "open" | "closed"; notes?: string }

export interface EventRegistration { id: string; name: string; customerId?: string; memberId?: string; chargeId?: string; flight?: number; gross?: number; status: "registered" | "withdrawn" }
export interface ClubEvent {
  id: string; name: string; type: "tournament" | "corporate" | "social" | "charity"; date: string; start: string; end: string; organizer: string; expected: number;
  fee: number; venue: string; status: "draft" | "confirmed" | "ongoing" | "completed" | "cancelled"; closureId?: string; registrations: EventRegistration[];
  flights: { no: number; time: string }[]; catering: { id: string; item: string; qty: number; cost: number; status: "requested" | "confirmed" | "served"; chargeId?: string }[];
  resources: { id: string; text: string; done: boolean }[]; notes: string; format: string;
}

export interface Waitlist { id: string; date: string; from: string; to: string; players: number; name: string; phone: string; customerId?: string; status: "waiting" | "booked" | "expired" | "cancelled"; createdAt: string; note?: string; bookingId?: string }
export interface Announcement { id: string; title: string; body: string; at: string; audience: "all" | "members"; active: boolean }
export interface Feedback { id: string; at: string; customerId?: string; name: string; rating: number; text: string }
export interface Message { id: string; at: string; channel: "sms" | "email"; to: string; text: string; bookingId?: string; simulated: true }
export interface AuditLog { id: string; at: string; actor: string; role: RoleId | "system"; action: string; entity: string; entityId: string; detail: string }
export interface AttendanceRecord { id: string }

export interface Settings {
  club: { tenantId: string; name: string; shortName: string; address: string; phone: string; email: string; timezone: string; currency: string };
  teeSheet: {
    firstTee: string; lastTee: string; interval: number; maxPlayers: number; startingTees: Tee[]; allowSharedSlots: boolean;
    advanceDaysPublic: number; advanceDaysMember: number; minNoticeMinutes: number; cancelHours: number; forfeitDepositOnLateCancel: boolean;
    depositPerPlayer: number; depositRequiredForPublic: boolean; noShowStrikeLimit: number; holidays: { date: string; name: string }[];
  };
  rates: {
    green: Record<DayType, Record<PlayerType, number>>; ninePct: number; cart18: number; cart9: number; playersPerCart: number;
    caddie: Record<"A" | "B" | "C", { f18: number; f9: number }>; caddieClubSharePct: Record<CaddieClass, number>;
    playersPerCaddie: number; caddieRequired: boolean; range: { bucketS: number; bucketM: number; bucketL: number; per30min: number; clubRental: number };
  };
  pace: { minutes18: number; minutes9: number; toleranceMin: number };
  rotation: { mode: "fewest_rounds" | "time_in"; allowPreferred: boolean };
  billing: { guestFeeBillTo: "sponsor" | "guest"; memberDefault: "account" | "counter"; dueDays: number };
  tax: { vatRate: number; serviceChargePct: number; note: string };
  authority: { posDiscountStaffMaxPct: number };
  departments: { id: string; name: string; head: string; active: boolean }[];
}

export interface DB {
  meta: { version: number; clubId: string; seededAt: string; today: string; now: string; seed: number };
  seq: Record<string, number>;
  settings: Settings;
  rolePerms: Record<RoleId, Permission[]>;
  holes: Hole[]; closures: Closure[];
  customers: Customer[]; plans: MembershipPlan[]; members: Member[]; sponsorships: Sponsorship[];
  bookings: Booking[]; rounds: Round[]; waitlist: Waitlist[]; messages: Message[];
  caddies: Caddie[]; caddieAttendance: CaddieAttendance[]; rotationEvents: RotationEvent[]; caddieAssignments: CaddieAssignment[]; caddieSettlements: CaddieSettlement[];
  carts: Cart[]; cartDispatches: CartDispatch[];
  staff: Staff[]; workOrders: WorkOrder[]; recurring: RecurringTask[]; assets: Asset[];
  inventory: InventoryItem[]; movements: InventoryMovement[];
  posOrders: PosOrder[]; rangeSales: RangeSale[]; rangeTabs: RangeTab[]; cafeTabs: CafeTab[];
  charges: Charge[]; payments: Payment[]; refunds: Refund[]; shifts: Shift[];
  events: ClubEvent[]; announcements: Announcement[]; feedback: Feedback[]; audit: AuditLog[];
  maintBudget: Record<string, number>; // monthly budget by maintenance category
  historicalMonthly: { month: string; revenue: number; rounds: number; members: number; publicPlayers: number }[];
}
