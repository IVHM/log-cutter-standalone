/**
 * Generates mock e-commerce CSVs for LogSplitter import / stress tests.
 *
 *   node scripts/generate-mock-ecommerce.cjs
 *   node scripts/generate-mock-ecommerce.cjs --events=5000 --out=public/mock-ecommerce-data/stress-l
 *   node scripts/generate-mock-ecommerce.cjs --events=200 --out=public/mock-ecommerce-data/stress-s
 *
 * Flags:
 *   --events=N   total events (default 1000); split ~80% purchase / 15% refund / 5% return
 *   --out=DIR    output directory relative to repo root (default public/mock-ecommerce-data)
 */
const fs = require("fs");
const path = require("path");

function argValue(prefix, fallback) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return fallback;
  const v = hit.slice(prefix.length);
  return v || fallback;
}

const TOTAL_EVENTS = Math.max(20, Number(argValue("--events=", "1000")) || 1000);
const OUT_REL = argValue("--out=", "public/mock-ecommerce-data");
const ROOT = path.isAbsolute(OUT_REL)
  ? OUT_REL
  : path.join(__dirname, "..", OUT_REL);

const PURCHASE_N = Math.round(TOTAL_EVENTS * 0.8);
const REFUND_N = Math.round(TOTAL_EVENTS * 0.15);
const RETURN_N = TOTAL_EVENTS - PURCHASE_N - REFUND_N;
const EVT_PAD = Math.max(4, String(TOTAL_EVENTS).length);

const HOSTS = ["ecom-api-1", "ecom-api-2", "ecom-worker-1", "ecom-cs-1"];

const FIRST = ["Ava", "Noah", "Mia", "Liam", "Zoe", "Ethan", "Iris", "Owen", "Chloe", "Kai", "Nina", "Jude", "Elena", "Miles", "Priya", "Sam", "Jordan", "Casey", "Riley", "Quinn"];
const LAST = ["Chen", "Brooks", "Lee", "Haddad", "Ortiz", "Nair", "Feldman", "Rossi", "Kim", "Patel", "Nguyen", "Silva", "Cohen", "Wright", "Diaz", "Murphy", "Sato", "Ali", "Berg", "Cole"];
const CITIES = [
  { city: "Seattle", state: "WA", zip: "98101" },
  { city: "Austin", state: "TX", zip: "78701" },
  { city: "Boston", state: "MA", zip: "02108" },
  { city: "Denver", state: "CO", zip: "80202" },
  { city: "Atlanta", state: "GA", zip: "30303" },
  { city: "Chicago", state: "IL", zip: "60601" },
  { city: "Portland", state: "OR", zip: "97201" },
  { city: "Miami", state: "FL", zip: "33101" },
];
const BRANDS = ["Northbeam", "Cedar&Co", "PixelForge", "Harbor Home", "Voltware", "Loom Labs"];
const CATEGORIES = [
  ["Electronics", "Audio"],
  ["Electronics", "Computing"],
  ["Home", "Kitchen"],
  ["Home", "Office"],
  ["Apparel", "Outerwear"],
  ["Sports", "Fitness"],
];
const ADJECTIVES = ["Compact", "Pro", "Lite", "Max", "Soft", "Rugged", "Minimal", "Classic"];
const NOUNS = ["Speaker", "Mug", "Lamp", "Backpack", "Keyboard", "Bottle", "Stand", "Charger", "Hoodie", "Mat"];

function pad(n, w) {
  return String(n).padStart(w, "0");
}
function pick(arr, i) {
  return arr[i % arr.length];
}
function money(n) {
  return Math.round(n * 100) / 100;
}
function csvEscape(obj) {
  return JSON.stringify(obj).replace(/"/g, '""');
}
function row(ts, host, obj) {
  return `${ts},${host},"${csvEscape(obj)}"`;
}
function iso(dayOffset, hour, min, sec, ms) {
  const d = new Date(Date.UTC(2025, 0, 1 + dayOffset, hour, min, sec, ms));
  return d.toISOString();
}

// --- Users (70) ---
const users = [];
for (let i = 1; i <= 70; i++) {
  const id = `usr_${pad(i, 3)}`;
  const given = pick(FIRST, i * 3);
  const family = pick(LAST, i * 5);
  const city = pick(CITIES, i);
  const deep = i % 11 === 0;
  const user = {
    userId: id,
    createdAt: iso(i % 40, 8, i % 60, 0, i),
    status: i % 17 === 0 ? "suspended" : "active",
    profile: {
      name: { given, family, display: `${given} ${family}` },
      email: {
        primary: `${given.toLowerCase()}.${family.toLowerCase()}${i}@example.com`,
        verified: i % 9 !== 0,
      },
      phone: i % 4 === 0 ? { countryCode: "1", number: `206555${pad(1000 + i, 4)}` } : null,
      address: {
        line1: `${100 + i} ${pick(["Pine", "Oak", "Market", "Lake"], i)} St`,
        ...city,
        country: "US",
      },
    },
    loyalty: {
      tier: pick(["none", "bronze", "silver", "gold"], i),
      points: (i * 37) % 5000,
    },
    prefs: {
      locale: "en-US",
      marketingOptIn: i % 3 !== 0,
      notifications: { email: true, sms: i % 5 === 0, push: i % 2 === 0 },
    },
  };
  if (deep) {
    user.account = {
      risk: {
        score: (i * 13) % 100,
        flags: i % 22 === 0 ? ["velocity"] : [],
        review: { required: i % 22 === 0, note: i % 22 === 0 ? "manual_check" : null },
      },
      auth: {
        subject: `auth0|${id}`,
        mfa: { enabled: i % 2 === 0, methods: i % 2 === 0 ? ["totp"] : [] },
      },
    };
  }
  users.push(user);
}

// --- Payment methods (120): some fingerprints shared across users ---
// 40 unique card fingerprints; distribute 120 pm records across users, reusing fingerprints
const fingerprints = [];
for (let f = 1; f <= 40; f++) {
  fingerprints.push({
    fingerprint: `fp_${pad(f, 3)}`,
    brand: pick(["visa", "mastercard", "amex", "discover"], f),
    last4: String(1000 + ((f * 97) % 9000)),
    expMonth: 1 + (f % 12),
    expYear: 2026 + (f % 5),
  });
}

const paymentMethods = [];
const pmsByUser = new Map(users.map((u) => [u.userId, []]));

// Ensure every user gets at least one PM
for (let i = 1; i <= 70; i++) {
  const fp = fingerprints[(i - 1) % fingerprints.length];
  const pmId = `pm_${pad(i, 3)}`;
  const userId = users[i - 1].userId;
  const pm = {
    paymentMethodId: pmId,
    userId,
    addedAt: iso(i % 50, 10, i % 60, 0, i),
    type: "card",
    status: i % 19 === 0 ? "expired" : "active",
    card: {
      ...fp,
      billing: {
        name: users[i - 1].profile.name.display,
        postalCode: users[i - 1].profile.address.zip,
        country: "US",
      },
    },
    wallet: i % 7 === 0 ? { provider: pick(["apple_pay", "google_pay"], i), deviceBound: true } : null,
  };
  if (i % 13 === 0) {
    pm.verification = {
      avs: pick(["pass", "fail", "unchecked"], i),
      cvc: "pass",
      network: { tokenized: true, networkToken: `nt_${pad(i, 4)}` },
    };
  }
  paymentMethods.push(pm);
  pmsByUser.get(userId).push(pm);
}

// Remaining 50 PMs: attach to random users; reuse fingerprints so same card appears on multiple accounts
for (let i = 71; i <= 120; i++) {
  const user = users[(i * 7) % 70];
  const fp = fingerprints[(i * 3) % fingerprints.length];
  const pmId = `pm_${pad(i, 3)}`;
  const pm = {
    paymentMethodId: pmId,
    userId: user.userId,
    addedAt: iso(i % 55, 11, i % 60, 0, i),
    type: "card",
    status: "active",
    card: {
      ...fp,
      billing: {
        name: user.profile.name.display,
        postalCode: user.profile.address.zip,
        country: "US",
      },
    },
    wallet: null,
  };
  paymentMethods.push(pm);
  pmsByUser.get(user.userId).push(pm);
}

// --- Items (100) ---
const items = [];
for (let i = 1; i <= 100; i++) {
  const id = `item_${pad(i, 3)}`;
  const cat = pick(CATEGORIES, i);
  const name = `${pick(ADJECTIVES, i)} ${pick(NOUNS, i * 2)}`;
  const price = money(8 + ((i * 17) % 190) + (i % 10) / 10);
  const item = {
    itemId: id,
    sku: `SKU-${pad(i, 4)}`,
    name,
    brand: pick(BRANDS, i),
    category: { primary: cat[0], secondary: cat[1], path: cat },
    pricing: {
      list: money(price * 1.15),
      sale: price,
      currency: "USD",
    },
    inventory: {
      inStock: i % 23 !== 0,
      warehouses: [
        { id: "wh_west", qty: (i * 3) % 40 },
        { id: "wh_east", qty: (i * 5) % 35 },
      ],
    },
    attrs: {
      color: pick(["black", "white", "navy", "sage", "crimson"], i),
      weightGrams: 100 + (i * 37) % 2000,
    },
  };
  if (i % 10 === 0) {
    item.specs = {
      dimensions: { l: 10 + (i % 20), w: 5 + (i % 10), h: 2 + (i % 8), unit: "cm" },
      materials: pick([["aluminum", "plastic"], ["cotton", "polyester"], ["glass"]], i),
      compliance: { prop65: false, countryOfOrigin: pick(["US", "CN", "VN", "MX"], i) },
    };
  }
  items.push(item);
}

// --- Events: ~80% purchase, ~15% refund, ~5% return ---
const purchases = [];
const events = [];

function activePmForUser(userId, salt) {
  const list = (pmsByUser.get(userId) || []).filter((p) => p.status === "active");
  const pool = list.length ? list : pmsByUser.get(userId) || [];
  return pool[salt % pool.length];
}

for (let i = 1; i <= PURCHASE_N; i++) {
  const evtId = `evt_${pad(i, EVT_PAD)}`;
  const user = users[(i * 11) % 70];
  const pm = activePmForUser(user.userId, i);
  const lineCount = 1 + (i % 5);
  const lines = [];
  for (let L = 0; L < lineCount; L++) {
    const item = items[(i * 3 + L * 7) % 100];
    const qty = 1 + ((i + L) % 3);
    lines.push({
      lineId: `line_${L + 1}`,
      itemId: item.itemId,
      name: item.name,
      quantity: qty,
      unitPrice: item.pricing.sale,
      lineTotal: money(qty * item.pricing.sale),
    });
  }
  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const shippingCost = pick([0, 5, 9.99, 15], i);
  const tax = money(subtotal * 0.088);
  const total = money(subtotal + tax + shippingCost);
  const day = (i * 3) % 200;
  const ts = iso(day, 8 + (i % 12), i % 60, i % 60, i % 1000);

  const purchase = {
    eventId: evtId,
    eventType: "purchase",
    occurredAt: ts,
    userId: user.userId,
    paymentMethodId: pm.paymentMethodId,
    order: {
      orderId: `ORD-2025-${pad(10000 + i, 5)}`,
      status: pick(["confirmed", "fulfilled", "shipped", "delivered"], i),
      basket: { lines, currency: "USD" },
      totals: { subtotal, tax, shipping: shippingCost, total },
      shipping: {
        method: pick(["Standard", "Express", "Pickup"], i),
        address: {
          line1: user.profile.address.line1,
          city: user.profile.address.city,
          state: user.profile.address.state,
          zip: user.profile.address.zip,
          country: "US",
        },
        tracking:
          i % 4 === 0
            ? null
            : {
                carrier: pick(["FastParcel", "ShipGo", "USPS"], i),
                number: `TRK${pad(i, 8)}`,
                url: `https://track.example.com/TRK${pad(i, 8)}`,
              },
      },
    },
    payment: {
      status: "captured",
      amount: total,
      currency: "USD",
      cardFingerprint: pm.card.fingerprint,
      last4: pm.card.last4,
    },
  };
  if (i % 15 === 0) {
    purchase.diagnostics = {
      latencyMs: 80 + (i % 300),
      storefront: { channel: pick(["web", "ios", "android"], i), experiment: { id: "chk_v3", variant: pick(["A", "B"], i) } },
    };
  }
  purchases.push(purchase);
  events.push({ ts, host: pick(HOSTS, i), body: purchase });
}

// Build refundable/returnable pools from purchases with lines
function cloneLinesSubset(purchase, salt, maxLines) {
  const lines = purchase.order.basket.lines;
  const n = Math.min(maxLines, 1 + (salt % lines.length));
  return lines.slice(0, n).map((l, idx) => ({
    lineId: l.lineId,
    itemId: l.itemId,
    name: l.name,
    quantity: Math.max(1, Math.min(l.quantity, 1 + ((salt + idx) % l.quantity))),
    unitPrice: l.unitPrice,
    lineTotal: money(Math.max(1, Math.min(l.quantity, 1 + ((salt + idx) % l.quantity))) * l.unitPrice),
  }));
}

for (let r = 0; r < REFUND_N; r++) {
  const purchase = purchases[(r * 17) % PURCHASE_N];
  const i = PURCHASE_N + r + 1;
  const evtId = `evt_${pad(i, EVT_PAD)}`;
  const refundLines = cloneLinesSubset(purchase, r, 3);
  const amount = money(refundLines.reduce((s, l) => s + l.lineTotal, 0) * 1.05);
  const day = ((r * 5) % 200) + 1;
  const ts = iso(day, 10 + (r % 8), r % 60, r % 60, r % 1000);
  const ticketId = `cs_${pad(2000 + r, 4)}`;

  const refund = {
    eventId: evtId,
    eventType: "refund",
    occurredAt: ts,
    userId: purchase.userId,
    paymentMethodId: purchase.paymentMethodId,
    purchaseEventId: purchase.eventId,
    orderId: purchase.order.orderId,
    customerService: {
      ticketId,
      openedAt: iso(day, 9, r % 60, 0, r),
      channel: pick(["chat", "email", "phone"], r),
      agent: { agentId: `agt_${pad(1 + (r % 12), 2)}`, display: pick(["Alex R", "Sam K", "Jamie T", "Chris P"], r) },
      reason: {
        code: pick(["damaged", "not_as_described", "changed_mind", "duplicate", "late_delivery"], r),
        note: pick(["Customer requested refund", "Item defective", "Wrong size"], r),
      },
    },
    refund: {
      status: pick(["succeeded", "pending", "succeeded"], r),
      amount: money(amount),
      currency: "USD",
      lines: refundLines,
      // no tracking — nothing to ship back for pure refund path in this model
      disposition: pick(["full", "partial"], r),
    },
    payment: {
      status: "refunded",
      cardFingerprint: purchase.payment.cardFingerprint,
      last4: purchase.payment.last4,
    },
  };
  if (r % 9 === 0) {
    refund.customerService.sla = { targetHours: 24, breached: false, firstResponseMinutes: 15 + (r % 40) };
  }
  events.push({ ts, host: pick(HOSTS, r + 3), body: refund });
}

for (let r = 0; r < RETURN_N; r++) {
  const purchase = purchases[(r * 23 + 3) % PURCHASE_N];
  const i = PURCHASE_N + REFUND_N + r + 1;
  const evtId = `evt_${pad(i, EVT_PAD)}`;
  const returnLines = cloneLinesSubset(purchase, r + 9, 2);
  const day = ((r * 7) % 200) + 2;
  const ts = iso(day, 12 + (r % 6), r % 60, r % 60, r % 1000);
  const ticketId = `cs_${pad(5000 + r, 4)}`;

  const ret = {
    eventId: evtId,
    eventType: "return",
    occurredAt: ts,
    userId: purchase.userId,
    paymentMethodId: purchase.paymentMethodId,
    purchaseEventId: purchase.eventId,
    orderId: purchase.order.orderId,
    customerService: {
      ticketId,
      openedAt: iso(day, 11, r % 60, 0, r),
      channel: pick(["email", "chat", "phone"], r),
      agent: { agentId: `agt_${pad(1 + (r % 12), 2)}`, display: pick(["Alex R", "Sam K", "Jamie T", "Chris P"], r) },
      reason: {
        code: pick(["wrong_item", "defective", "size", "changed_mind"], r),
        note: "Return authorized",
      },
    },
    return: {
      status: pick(["label_created", "in_transit", "received", "closed"], r),
      lines: returnLines,
      rma: `RMA-${pad(8000 + r, 5)}`,
      tracking: {
        carrier: pick(["FastParcel", "ShipGo"], r),
        number: `RET${pad(r + 1, 8)}`,
        direction: "inbound",
        url: `https://track.example.com/RET${pad(r + 1, 8)}`,
      },
      refundOnReceipt: {
        estimatedAmount: money(returnLines.reduce((s, l) => s + l.lineTotal, 0)),
        currency: "USD",
      },
    },
    // returns keep tracking; refunds do not
  };
  if (r % 5 === 0) {
    ret.return.inspection = {
      required: true,
      result: pick(["pending", "accepted", "rejected"], r),
      notes: { warehouse: "wh_west", photos: r % 10 === 0 ? ["img_1"] : [] },
    };
  }
  events.push({ ts, host: pick(HOSTS, r + 5), body: ret });
}

// --- Write CSVs ---
fs.mkdirSync(ROOT, { recursive: true });

function writeCsv(name, rows) {
  const header = "timestamp,host,json";
  const body = rows.map((r) => row(r.ts, r.host, r.body)).join("\n");
  fs.writeFileSync(path.join(ROOT, name), `${header}\n${body}\n`, "utf8");
}

writeCsv(
  "users.csv",
  users.map((u, i) => ({ ts: u.createdAt, host: pick(HOSTS, i), body: u })),
);
writeCsv(
  "payment-methods.csv",
  paymentMethods.map((p, i) => ({ ts: p.addedAt, host: pick(HOSTS, i + 1), body: p })),
);
writeCsv(
  "items.csv",
  items.map((it, i) => ({
    ts: iso(0, 0, 0, 0, i),
    host: "ecom-catalog-1",
    body: it,
  })),
);
writeCsv("events.csv", events);

// sanity
const sharedFp = new Map();
for (const pm of paymentMethods) {
  const k = pm.card.fingerprint;
  if (!sharedFp.has(k)) sharedFp.set(k, new Set());
  sharedFp.get(k).add(pm.userId);
}
const multiUserCards = [...sharedFp.values()].filter((s) => s.size > 1).length;

console.log(
  JSON.stringify(
    {
      dir: ROOT,
      users: users.length,
      paymentMethods: paymentMethods.length,
      items: items.length,
      events: events.length,
      purchases: PURCHASE_N,
      refunds: REFUND_N,
      returns: RETURN_N,
      fingerprintsSharedAcrossUsers: multiUserCards,
      out: ROOT,
    },
    null,
    2,
  ),
);
