import { ApiHttpError } from "../middleware/errors";
import {
  areActiveParticipants,
  getSettlement,
  insertSettlementStatement,
  type Settlement,
  type SettlementWrite,
} from "../repositories/settlement-repository";
import { createId } from "../utils/ids";
import { rupeesToPaise } from "../utils/money";
import type { SettlementInput } from "../validation/settlements";

export type Contribution = {
  personId: string;
  name: string;
  paidPaise: number;
};

export type RecordedSettlement = {
  fromPersonId: string;
  toPersonId: string;
  amountPaise: number;
};

export type RecommendedTransfer = {
  fromPersonId: string;
  toPersonId: string;
  amountPaise: number;
};

export type SettlementResult = {
  totalSharedExpensePaise: number;
  participants: Array<Contribution & {
    expectedPaise: number;
    balancePaise: number;
  }>;
  recommendedTransfers: RecommendedTransfer[];
};

type MutableParticipant = SettlementResult["participants"][number];

function compareById<T extends { personId: string }>(left: T, right: T): number {
  return left.personId.localeCompare(right.personId);
}

function assertPaise(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer paise value`);
  }
}

function assertReconciled(participants: MutableParticipant[], transfers: RecommendedTransfer[]): void {
  const remaining = new Map(participants.map((person) => [person.personId, person.balancePaise]));
  for (const transfer of transfers) {
    remaining.set(transfer.fromPersonId, (remaining.get(transfer.fromPersonId) ?? 0) + transfer.amountPaise);
    remaining.set(transfer.toPersonId, (remaining.get(transfer.toPersonId) ?? 0) - transfer.amountPaise);
  }
  if ([...remaining.values()].some((balance) => balance !== 0)) {
    throw new Error("Settlement transfers do not reconcile participant balances");
  }
}

/** Calculates equal participant shares and the minimum deterministic transfer set. */
export function calculateSettlement(input: {
  contributions: Contribution[];
  settlements: RecordedSettlement[];
}): SettlementResult {
  const participants = [...input.contributions].sort(compareById).map((contribution) => {
    if (!contribution.personId || !contribution.name) {
      throw new TypeError("Participants require an id and name");
    }
    assertPaise(contribution.paidPaise, "Contribution");
    return { ...contribution, expectedPaise: 0, balancePaise: 0 };
  });
  const ids = new Set(participants.map((participant) => participant.personId));
  if (ids.size !== participants.length) throw new TypeError("Participant ids must be unique");

  const totalSharedExpensePaise = participants.reduce(
    (total, participant) => total + participant.paidPaise,
    0,
  );
  assertPaise(totalSharedExpensePaise, "Total contribution");
  const expectedBase = participants.length === 0 ? 0 : Math.floor(totalSharedExpensePaise / participants.length);
  const remainder = participants.length === 0 ? 0 : totalSharedExpensePaise % participants.length;
  const participantById = new Map(participants.map((participant) => [participant.personId, participant]));

  participants.forEach((participant, index) => {
    participant.expectedPaise = expectedBase + (index < remainder ? 1 : 0);
    participant.balancePaise = participant.paidPaise - participant.expectedPaise;
  });

  for (const settlement of input.settlements) {
    assertPaise(settlement.amountPaise, "Settlement amount");
    if (settlement.amountPaise === 0 || settlement.fromPersonId === settlement.toPersonId) {
      throw new TypeError("Settlements require distinct people and a positive paise amount");
    }
    const payer = participantById.get(settlement.fromPersonId);
    const receiver = participantById.get(settlement.toPersonId);
    if (!payer || !receiver) throw new TypeError("Settlement references an unknown participant");
    payer.balancePaise += settlement.amountPaise;
    receiver.balancePaise -= settlement.amountPaise;
  }

  const debtors = participants
    .filter((participant) => participant.balancePaise < 0)
    .sort((left, right) => Math.abs(right.balancePaise) - Math.abs(left.balancePaise) || compareById(left, right))
    .map((participant) => ({ personId: participant.personId, amountPaise: -participant.balancePaise }));
  const creditors = participants
    .filter((participant) => participant.balancePaise > 0)
    .sort((left, right) => right.balancePaise - left.balancePaise || compareById(left, right))
    .map((participant) => ({ personId: participant.personId, amountPaise: participant.balancePaise }));
  const recommendedTransfers: RecommendedTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]!;
    const creditor = creditors[creditorIndex]!;
    const amountPaise = Math.min(debtor.amountPaise, creditor.amountPaise);
    recommendedTransfers.push({
      fromPersonId: debtor.personId,
      toPersonId: creditor.personId,
      amountPaise,
    });
    debtor.amountPaise -= amountPaise;
    creditor.amountPaise -= amountPaise;
    if (debtor.amountPaise === 0) debtorIndex += 1;
    if (creditor.amountPaise === 0) creditorIndex += 1;
  }

  assertReconciled(participants, recommendedTransfers);
  return { totalSharedExpensePaise, participants, recommendedTransfers };
}

function settlementAuditStatement(
  db: D1Database,
  settlement: SettlementWrite,
  actor: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_log (
        id, entity_type, entity_id, action, actor, before_json, after_json
      ) VALUES (?, 'settlement', ?, 'SETTLEMENT', ?, NULL, ?)`,
    )
    .bind(
      createId(),
      settlement.id,
      actor,
      JSON.stringify(settlement),
    );
}

/** Converts the request's decimal string once and atomically records its settlement and audit entry. */
export async function createSettlement(
  db: D1Database,
  input: SettlementInput,
  actor: string,
): Promise<Settlement> {
  const amountPaise = rupeesToPaise(input.amount);
  if (!(await areActiveParticipants(db, [input.fromPersonId, input.toPersonId]))) {
    throw new ApiHttpError(
      422,
      "VALIDATION_ERROR",
      "Settlement people must be active shared-expense participants",
    );
  }
  const settlement: SettlementWrite = {
    id: createId(),
    fromPersonId: input.fromPersonId,
    toPersonId: input.toPersonId,
    amountPaise,
    settlementDate: input.settlementDate,
    remarks: input.remarks ?? null,
    createdAt: new Date().toISOString(),
  };
  await db.batch([
    insertSettlementStatement(db, settlement),
    settlementAuditStatement(db, settlement, actor),
  ]);
  const storedSettlement = await getSettlement(db, settlement.id);
  if (!storedSettlement) {
    throw new ApiHttpError(
      500,
      "STORAGE_ERROR",
      "The settlement could not be read after writing",
    );
  }
  return storedSettlement;
}
