import type { Contribution, RecordedSettlement } from "../services/settlement-service";

export type Settlement = {
  id: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId: string;
  toPersonName: string;
  amountPaise: number;
  settlementDate: string;
  remarks: string | null;
  createdAt: string;
};

type SettlementRow = {
  id: string;
  from_person_id: string;
  from_person_name: string;
  to_person_id: string;
  to_person_name: string;
  amount_paise: number;
  settlement_date: string;
  remarks: string | null;
  created_at: string;
};

type ParticipantRow = {
  person_id: string;
  name: string;
  paid_paise: number;
};

type ActiveParticipantRow = { id: string };

export type SettlementWrite = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  amountPaise: number;
  settlementDate: string;
  remarks: string | null;
  createdAt: string;
};

const SETTLEMENT_SELECT = `
  SELECT s.id, s.from_person_id, payer.name AS from_person_name,
    s.to_person_id, receiver.name AS to_person_name, s.amount_paise,
    s.settlement_date, s.remarks, s.created_at
  FROM settlements s
  JOIN people payer ON payer.id = s.from_person_id
  JOIN people receiver ON receiver.id = s.to_person_id`;

function mapSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    fromPersonId: row.from_person_id,
    fromPersonName: row.from_person_name,
    toPersonId: row.to_person_id,
    toPersonName: row.to_person_name,
    amountPaise: row.amount_paise,
    settlementDate: row.settlement_date,
    remarks: row.remarks,
    createdAt: row.created_at,
  };
}

export async function listSettlements(db: D1Database): Promise<Settlement[]> {
  const rows = await db
    .prepare(`${SETTLEMENT_SELECT} ORDER BY s.settlement_date DESC, s.created_at DESC, s.id DESC`)
    .all<SettlementRow>();
  return rows.results.map(mapSettlement);
}

export async function listSettlementContributions(
  db: D1Database,
): Promise<Contribution[]> {
  const rows = await db
    .prepare(
      `SELECT p.id AS person_id, p.name, COALESCE(SUM(e.amount_paise), 0) AS paid_paise
       FROM people p
       LEFT JOIN expenses e ON e.paid_by_person_id = p.id
         AND e.is_shared = 1
         AND e.deleted_at IS NULL
       WHERE p.active = 1
         AND p.farm_role = 'owner'
         AND p.participates_in_shared_expenses = 1
       GROUP BY p.id, p.name
       ORDER BY p.id ASC`,
    )
    .all<ParticipantRow>();
  return rows.results.map((row) => ({
    personId: row.person_id,
    name: row.name,
    paidPaise: row.paid_paise,
  }));
}

export async function listRecordedSettlements(
  db: D1Database,
): Promise<RecordedSettlement[]> {
  const rows = await db
    .prepare(
      "SELECT from_person_id, to_person_id, amount_paise FROM settlements ORDER BY settlement_date ASC, created_at ASC, id ASC",
    )
    .all<{
      from_person_id: string;
      to_person_id: string;
      amount_paise: number;
    }>();
  return rows.results.map((row) => ({
    fromPersonId: row.from_person_id,
    toPersonId: row.to_person_id,
    amountPaise: row.amount_paise,
  }));
}

export async function areActiveParticipants(
  db: D1Database,
  personIds: readonly string[],
): Promise<boolean> {
  const rows = await db
    .prepare(
      `SELECT id FROM people WHERE id IN (?, ?)
       AND active = 1 AND farm_role = 'owner'
       AND participates_in_shared_expenses = 1`,
    )
    .bind(personIds[0], personIds[1])
    .all<ActiveParticipantRow>();
  return rows.results.length === personIds.length;
}

export function insertSettlementStatement(
  db: D1Database,
  settlement: SettlementWrite,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO settlements (
        id, from_person_id, to_person_id, amount_paise, settlement_date, remarks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      settlement.id,
      settlement.fromPersonId,
      settlement.toPersonId,
      settlement.amountPaise,
      settlement.settlementDate,
      settlement.remarks,
      settlement.createdAt,
    );
}

export async function getSettlement(
  db: D1Database,
  id: string,
): Promise<Settlement | null> {
  const row = await db
    .prepare(`${SETTLEMENT_SELECT} WHERE s.id = ? LIMIT 1`)
    .bind(id)
    .first<SettlementRow>();
  return row ? mapSettlement(row) : null;
}
