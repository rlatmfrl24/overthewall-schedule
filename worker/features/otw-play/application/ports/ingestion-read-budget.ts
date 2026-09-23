import type { OtwPlayIngestionBudgetDto } from "@contracts/otw-play";

export interface IngestionReadBudget {
  read(): Promise<OtwPlayIngestionBudgetDto>;
}
