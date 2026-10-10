import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Shared column helpers and value types
// ---------------------------------------------------------------------------

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const id = () => uuid("id").primaryKey().defaultRandom();

export type UserRole = "owner" | "agent" | "packer";

export type OrderSource = "demo_store" | "seed" | "shopify";

export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "partially_refunded"
  | "refunded"
  | "disputed";

export type FulfilmentStatus =
  | "unfulfilled"
  | "packing"
  | "packed"
  | "handed_to_carrier"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export type Address = {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
};

export type MerchantSettings = {
  billing?: {
    checkoutSessionId?: string;
    subscriptionId?: string;
    status?: string;
    testMode?: boolean;
    paymentStatus?: string;
    amountPaid?: number;
    currency?: string;
    invoiceId?: string;
  };
  /** Prefix for order numbers, e.g. "VB" gives VB-1001. */
  orderPrefix?: string;
  /** Hold incoming test-mode disputes until released from the demo controls. */
  holdTestDisputes?: boolean;
  refundPolicy?: string;
  shippingPolicy?: string;
  supportSignature?: string;
};

export type ThreeDSecureResult = {
  result?: string | null;
  version?: string | null;
  authenticationFlow?: string | null;
  electronicCommerceIndicator?: string | null;
};

export type LedgerActorType = "system" | "user" | "customer" | "integration" | "ai";

export type LedgerAttachment = {
  fileId: string;
  sha256: string;
  kind: string;
};

export type EvidenceFileKind =
  | "packing_contents_photo"
  | "packing_label_photo"
  | "proof_of_delivery"
  | "customer_attachment"
  | "order_report_pdf"
  | "dispute_packet_pdf"
  | "dispute_shipping_pdf"
  | "dispute_communication_pdf";

export type PackingSessionStatus =
  | "in_progress"
  | "completed"
  | "completed_with_exceptions"
  | "abandoned";

export type PackingExceptionKind =
  | "wrong_item"
  | "over_quantity"
  | "unknown_code"
  | "wrong_label"
  | "short_pack"
  | "manual_entry"
  | "photo_skipped"
  | "label_not_scanned";

export type PackingException = {
  kind: PackingExceptionKind;
  code?: string;
  orderItemId?: string;
  note?: string;
  /**
   * False: the packer was warned and corrected it. True: a person chose to
   * continue anyway and gave a reason.
   */
  overridden: boolean;
  at: string;
};

export type ScanKind = "order" | "item" | "label";
export type ScanResult =
  | "ok"
  | "wrong_item"
  | "over_quantity"
  | "unknown_code"
  | "wrong_label"
  | "override";
export type ScanMethod = "camera" | "scanner" | "manual";

export type ProofOfDelivery = {
  method: "signature" | "photo" | "safe_place" | "handed_to_resident";
  signedBy?: string;
  note?: string;
  fileId?: string;
};

export type ComplaintChannel = "web_form" | "manual" | "email_paste";
export type ComplaintCategory =
  | "not_received"
  | "missing_item"
  | "wrong_item"
  | "damaged"
  | "billing_confusion"
  | "refund_request"
  | "other";
export type ComplaintStatus =
  | "new"
  | "investigating"
  | "awaiting_customer"
  | "resolved"
  | "escalated";
export type ComplaintResolution =
  | "clarified"
  | "refunded"
  | "partially_refunded"
  | "replacement_sent"
  | "declined"
  | "other";

export type AiRunKind = "investigation" | "rebuttal" | "win_assessment";
export type AiRunStatus = "running" | "succeeded" | "failed";

export type DisputeResponseStatus = "draft" | "approved" | "submitted" | "failed";

export type StripeEventStatus = "processing" | "processed" | "ignored" | "failed";

// ---------------------------------------------------------------------------
// Tenancy and access
// ---------------------------------------------------------------------------

export const merchants = pgTable("merchants", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("eur"),
  supportEmail: text("support_email"),
  settings: jsonb("settings").$type<MerchantSettings>().notNull().default({}),
  orderCounter: integer("order_counter").notNull().default(1000),
  complaintCounter: integer("complaint_counter").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_unique").on(t.tokenHash)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: id(),
    email: text("email").notNull(),
    succeeded: boolean("succeeded").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_at").on(t.email, t.at)],
);

export const accessLogs = pgTable(
  "access_logs",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    orderId: uuid("order_id"),
    userAgent: text("user_agent"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("access_logs_merchant_at").on(t.merchantId, t.at)],
);

// ---------------------------------------------------------------------------
// Catalogue, customers, orders
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    barcode: text("barcode").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    priceMinor: integer("price_minor").notNull(),
    /** Key of the built-in product illustration. */
    art: text("art").notNull().default("box"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("products_merchant_sku_unique").on(t.merchantId, t.sku),
    uniqueIndex("products_merchant_barcode_unique").on(t.merchantId, t.barcode),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    phone: text("phone"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_merchant_email_unique").on(t.merchantId, t.email)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    source: text("source").$type<OrderSource>().notNull(),
    sourceOrderId: text("source_order_id"),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    customerEmail: text("customer_email"),
    customerName: text("customer_name"),
    shippingAddress: jsonb("shipping_address").$type<Address>(),
    billingAddress: jsonb("billing_address").$type<Address>(),
    currency: text("currency").notNull(),
    subtotalMinor: integer("subtotal_minor").notNull(),
    shippingMinor: integer("shipping_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("pending"),
    fulfilmentStatus: text("fulfilment_status")
      .$type<FulfilmentStatus>()
      .notNull()
      .default("unfulfilled"),
    checkoutSessionId: text("checkout_session_id"),
    /** Seeded demo history: no real payment behind it. */
    simulated: boolean("simulated").notNull().default(false),
    placedAt: ts("placed_at").notNull().defaultNow(),
    paidAt: ts("paid_at"),
    packedAt: ts("packed_at"),
    handedToCarrierAt: ts("handed_to_carrier_at"),
    deliveredAt: ts("delivered_at"),
    /** Head of this order's evidence hash chain. */
    ledgerSeq: integer("ledger_seq").notNull().default(0),
    ledgerHeadHash: text("ledger_head_hash"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_merchant_number_unique").on(t.merchantId, t.number),
    uniqueIndex("orders_checkout_session_unique").on(t.checkoutSessionId),
    index("orders_merchant_placed").on(t.merchantId, t.placedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    sku: text("sku").notNull(),
    barcode: text("barcode").notNull(),
    name: text("name").notNull(),
    art: text("art").notNull().default("box"),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(),
  },
  (t) => [index("order_items_order").on(t.orderId)],
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const payments = pgTable(
  "payments",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"stripe" | "simulated">().notNull(),
    paymentIntentId: text("payment_intent_id"),
    chargeId: text("charge_id"),
    amountMinor: integer("amount_minor").notNull(),
    amountRefundedMinor: integer("amount_refunded_minor").notNull().default(0),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    paymentMethodType: text("payment_method_type"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    cardCountry: text("card_country"),
    cardFunding: text("card_funding"),
    wallet: text("wallet"),
    cvcCheck: text("cvc_check"),
    addressLine1Check: text("address_line1_check"),
    postalCodeCheck: text("postal_code_check"),
    threeDSecure: jsonb("three_d_secure").$type<ThreeDSecureResult>(),
    riskLevel: text("risk_level"),
    riskScore: integer("risk_score"),
    networkStatus: text("network_status"),
    sellerMessage: text("seller_message"),
    receiptUrl: text("receipt_url"),
    livemode: boolean("livemode").notNull().default(false),
    paidAt: ts("paid_at").notNull(),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_payment_intent_unique").on(t.paymentIntentId),
    index("payments_order").on(t.orderId),
    index("payments_charge").on(t.chargeId),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    stripeRefundId: text("stripe_refund_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    status: text("status").notNull(),
    simulated: boolean("simulated").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("refunds_stripe_refund_unique").on(t.stripeRefundId),
    index("refunds_order").on(t.orderId),
  ],
);

export const stripeEvents = pgTable("stripe_events", {
  /** Stripe event ID (evt_...). The primary key makes processing idempotent. */
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  livemode: boolean("livemode").notNull().default(false),
  via: text("via").$type<"webhook" | "sync">().notNull(),
  status: text("status").$type<StripeEventStatus>().notNull(),
  note: text("note"),
  stripeCreatedAt: ts("stripe_created_at").notNull(),
  processedAt: ts("processed_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Evidence: files and the append-only ledger
// ---------------------------------------------------------------------------

export const evidenceFiles = pgTable(
  "evidence_files",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    kind: text("kind").$type<EvidenceFileKind>().notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 of the stored bytes, computed on the server at upload time. */
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalName: text("original_name"),
    storageDriver: text("storage_driver").notNull().default("postgres"),
    /** Time the device says the file was captured. Not trusted; shown as claimed. */
    capturedAt: ts("captured_at"),
    simulated: boolean("simulated").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("evidence_files_order").on(t.orderId)],
);

export const evidenceBlobs = pgTable("evidence_blobs", {
  fileId: uuid("file_id")
    .primaryKey()
    .references(() => evidenceFiles.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
});

export const ledgerEvents = pgTable(
  "ledger_events",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Position in the order's chain, starting at 1. Cited by the AI as E<seq>. */
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    /** When the thing happened, according to its source. */
    occurredAt: ts("occurred_at").notNull(),
    /** When ProofShield recorded it. */
    recordedAt: ts("recorded_at").notNull(),
    actorType: text("actor_type").$type<LedgerActorType>().notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    attachments: jsonb("attachments").$type<LedgerAttachment[]>().notNull().default([]),
    /** Produced by a demo simulator or seed rather than a real system. */
    simulated: boolean("simulated").notNull().default(false),
    dedupeKey: text("dedupe_key"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [
    uniqueIndex("ledger_events_order_seq_unique").on(t.orderId, t.seq),
    uniqueIndex("ledger_events_order_dedupe_unique").on(t.orderId, t.dedupeKey),
    index("ledger_events_merchant_recorded").on(t.merchantId, t.recordedAt),
  ],
);

// ---------------------------------------------------------------------------
// Packing and shipping
// ---------------------------------------------------------------------------

export const packingSessions = pgTable(
  "packing_sessions",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    packerUserId: uuid("packer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    packerName: text("packer_name"),
    stationLabel: text("station_label").notNull().default("Station 1"),
    status: text("status").$type<PackingSessionStatus>().notNull().default("in_progress"),
    /** Verified quantity per order item ID. */
    itemCounts: jsonb("item_counts").$type<Record<string, number>>().notNull().default({}),
    exceptions: jsonb("exceptions").$type<PackingException[]>().notNull().default([]),
    labelVerified: boolean("label_verified").notNull().default(false),
    contentsPhotoFileId: uuid("contents_photo_file_id"),
    labelPhotoFileId: uuid("label_photo_file_id"),
    simulated: boolean("simulated").notNull().default(false),
    startedAt: ts("started_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("packing_sessions_order").on(t.orderId)],
);

export const packingScans = pgTable(
  "packing_scans",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => packingSessions.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id"),
    code: text("code").notNull(),
    kind: text("kind").$type<ScanKind>().notNull(),
    result: text("result").$type<ScanResult>().notNull(),
    method: text("method").$type<ScanMethod>().notNull(),
    note: text("note"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("packing_scans_session").on(t.sessionId)],
);

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    carrier: text("carrier").notNull(),
    service: text("service").notNull(),
    trackingNumber: text("tracking_number").notNull(),
    status: text("status").notNull().default("label_created"),
    proofOfDelivery: jsonb("proof_of_delivery").$type<ProofOfDelivery>(),
    simulated: boolean("simulated").notNull().default(true),
    labelCreatedAt: ts("label_created_at").notNull().defaultNow(),
    handedToCarrierAt: ts("handed_to_carrier_at"),
    deliveredAt: ts("delivered_at"),
  },
  (t) => [
    uniqueIndex("shipments_order_unique").on(t.orderId),
    uniqueIndex("shipments_tracking_unique").on(t.trackingNumber),
  ],
);

// ---------------------------------------------------------------------------
// Stage 1: complaints
// ---------------------------------------------------------------------------

export const complaints = pgTable(
  "complaints",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    channel: text("channel").$type<ComplaintChannel>().notNull(),
    customerEmail: text("customer_email"),
    customerName: text("customer_name"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    category: text("category").$type<ComplaintCategory>(),
    status: text("status").$type<ComplaintStatus>().notNull().default("new"),
    resolution: text("resolution").$type<ComplaintResolution>(),
    resolutionNote: text("resolution_note"),
    /** Unguessable token for the customer's own view of the case. */
    publicToken: text("public_token").notNull(),
    simulated: boolean("simulated").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    resolvedAt: ts("resolved_at"),
  },
  (t) => [
    uniqueIndex("complaints_merchant_number_unique").on(t.merchantId, t.number),
    uniqueIndex("complaints_public_token_unique").on(t.publicToken),
    index("complaints_order").on(t.orderId),
  ],
);

export const complaintMessages = pgTable(
  "complaint_messages",
  {
    id: id(),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"inbound" | "outbound" | "internal">().notNull(),
    authorLabel: text("author_label").notNull(),
    body: text("body").notNull(),
    /** Set when the text started as an AI draft, even if the merchant edited it. */
    aiRunId: uuid("ai_run_id"),
    attachmentFileIds: jsonb("attachment_file_ids").$type<string[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("complaint_messages_complaint").on(t.complaintId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// AI audit trail
// ---------------------------------------------------------------------------

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").$type<"complaint" | "dispute">().notNull(),
    subjectId: uuid("subject_id").notNull(),
    kind: text("kind").$type<AiRunKind>().notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").$type<AiRunStatus>().notNull().default("running"),
    /** IDs of the evidence items the model was shown. */
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    output: jsonb("output").$type<Record<string, unknown>>(),
    /** Result of the grounding and wording checks run on the output. */
    validation: jsonb("validation").$type<Record<string, unknown>>(),
    error: text("error"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: text("cost_usd"),
    latencyMs: integer("latency_ms"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ai_runs_subject").on(t.subjectType, t.subjectId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Stage 2: disputes
// ---------------------------------------------------------------------------

export const disputes = pgTable(
  "disputes",
  {
    id: id(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    complaintId: uuid("complaint_id").references(() => complaints.id, {
      onDelete: "set null",
    }),
    stripeDisputeId: text("stripe_dispute_id").notNull(),
    chargeId: text("charge_id"),
    paymentIntentId: text("payment_intent_id"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason").notNull(),
    networkReasonCode: text("network_reason_code"),
    cardBrand: text("card_brand"),
    stripeStatus: text("stripe_status").notNull(),
    isInquiry: boolean("is_inquiry").notNull().default(false),
    evidenceDueBy: ts("evidence_due_by"),
    livemode: boolean("livemode").notNull().default(false),
    /** Demo only: a test dispute kept out of view until released. */
    held: boolean("held").notNull().default(false),
    releasedAt: ts("released_at"),
    stripeCreatedAt: ts("stripe_created_at").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    outcome: text("outcome").$type<"won" | "lost" | "closed">(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    uniqueIndex("disputes_stripe_dispute_unique").on(t.stripeDisputeId),
    index("disputes_order").on(t.orderId),
  ],
);

export const disputeResponses = pgTable(
  "dispute_responses",
  {
    id: id(),
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => disputes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").$type<DisputeResponseStatus>().notNull().default("draft"),
    aiRunId: uuid("ai_run_id"),
    rebuttalText: text("rebuttal_text").notNull().default(""),
    /** Text values keyed by Stripe evidence field name. */
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    /** Ledger sequence numbers selected as evidence. */
    selectedEvidence: jsonb("selected_evidence").$type<number[]>().notNull().default([]),
    packetFileId: uuid("packet_file_id"),
    shippingFileId: uuid("shipping_file_id"),
    communicationFileId: uuid("communication_file_id"),
    /** Test mode only: which outcome Stripe was asked to simulate. */
    simulatedOutcome: text("simulated_outcome").$type<"win" | "lose" | "none">(),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: ts("approved_at"),
    submittedAt: ts("submitted_at"),
    /** Exactly what was sent to the payment provider. */
    submissionSnapshot: jsonb("submission_snapshot").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dispute_responses_dispute_version_unique").on(t.disputeId, t.version)],
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type Merchant = typeof merchants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type EvidenceFile = typeof evidenceFiles.$inferSelect;
export type LedgerEvent = typeof ledgerEvents.$inferSelect;
export type PackingSession = typeof packingSessions.$inferSelect;
export type PackingScan = typeof packingScans.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
export type ComplaintMessage = typeof complaintMessages.$inferSelect;
export type AiRun = typeof aiRuns.$inferSelect;
export type Dispute = typeof disputes.$inferSelect;
export type DisputeResponse = typeof disputeResponses.$inferSelect;
