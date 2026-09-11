import { describe, expect, it } from "vitest";
import { calculateSettlement } from "../../worker/services/settlement-service";

describe("calculateSettlement", () => {
  it("leaves equal contributions settled", () => {
    expect(
      calculateSettlement({
        contributions: [
          { personId: "person_a", name: "Asha", paidPaise: 800_000 },
          { personId: "person_b", name: "Bala", paidPaise: 800_000 },
        ],
        settlements: [],
      }),
    ).toEqual({
      totalSharedExpensePaise: 1_600_000,
      participants: [
        { personId: "person_a", name: "Asha", paidPaise: 800_000, expectedPaise: 800_000, balancePaise: 0 },
        { personId: "person_b", name: "Bala", paidPaise: 800_000, expectedPaise: 800_000, balancePaise: 0 },
      ],
      recommendedTransfers: [],
    });
  });

  it("asks each of three participants to repay the sole contributor", () => {
    const result = calculateSettlement({
      contributions: [
        { personId: "person_a", name: "Asha", paidPaise: 1_600_000 },
        { personId: "person_b", name: "Bala", paidPaise: 0 },
        { personId: "person_c", name: "Chitra", paidPaise: 0 },
      ],
      settlements: [],
    });

    expect(result.recommendedTransfers).toEqual([
      { fromPersonId: "person_b", toPersonId: "person_a", amountPaise: 533_333 },
      { fromPersonId: "person_c", toPersonId: "person_a", amountPaise: 533_333 },
    ]);
    expect(result.participants).toEqual([
      { personId: "person_a", name: "Asha", paidPaise: 1_600_000, expectedPaise: 533_334, balancePaise: 1_066_666 },
      { personId: "person_b", name: "Bala", paidPaise: 0, expectedPaise: 533_333, balancePaise: -533_333 },
      { personId: "person_c", name: "Chitra", paidPaise: 0, expectedPaise: 533_333, balancePaise: -533_333 },
    ]);
  });

  it("reduces the payer debt and receiver credit when applying a recorded settlement", () => {
    const result = calculateSettlement({
      contributions: [
        { personId: "person_a", name: "Asha", paidPaise: 1_600_000 },
        { personId: "person_b", name: "Bala", paidPaise: 0 },
      ],
      settlements: [
        { fromPersonId: "person_b", toPersonId: "person_a", amountPaise: 200_000 },
      ],
    });

    expect(result.participants).toEqual([
      { personId: "person_a", name: "Asha", paidPaise: 1_600_000, expectedPaise: 800_000, balancePaise: 600_000 },
      { personId: "person_b", name: "Bala", paidPaise: 0, expectedPaise: 800_000, balancePaise: -600_000 },
    ]);
    expect(result.recommendedTransfers).toEqual([
      { fromPersonId: "person_b", toPersonId: "person_a", amountPaise: 600_000 },
    ]);
  });

  it("allocates odd-paise remainder by participant id and produces stable transfer ordering", () => {
    const result = calculateSettlement({
      contributions: [
        { personId: "person_c", name: "Chitra", paidPaise: 0 },
        { personId: "person_a", name: "Asha", paidPaise: 3 },
        { personId: "person_b", name: "Bala", paidPaise: 1 },
      ],
      settlements: [],
    });

    expect(result.participants).toEqual([
      { personId: "person_a", name: "Asha", paidPaise: 3, expectedPaise: 2, balancePaise: 1 },
      { personId: "person_b", name: "Bala", paidPaise: 1, expectedPaise: 1, balancePaise: 0 },
      { personId: "person_c", name: "Chitra", paidPaise: 0, expectedPaise: 1, balancePaise: -1 },
    ]);
    expect(result.recommendedTransfers).toEqual([
      { fromPersonId: "person_c", toPersonId: "person_a", amountPaise: 1 },
    ]);
  });

  it("reproduces the verified legacy workbook settlement", () => {
    expect(calculateSettlement({
      contributions: [
        { personId: "person_satish", name: "Satish", paidPaise: 149301700 },
        { personId: "person_mahesh", name: "Mahesh", paidPaise: 148318000 },
      ],
      settlements: [],
    }).recommendedTransfers).toEqual([
      { fromPersonId: "person_mahesh", toPersonId: "person_satish", amountPaise: 491850 },
    ]);
  });
});
