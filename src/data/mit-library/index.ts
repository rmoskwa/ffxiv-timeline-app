import type { Job, MitigationType } from "@/domain/types";
import { AST_MITS } from "./ast";
import { BLM_MITS } from "./blm";
import { BRD_MITS } from "./brd";
import { DNC_MITS } from "./dnc";
import { DRG_MITS } from "./drg";
import { DRK_MITS } from "./drk";
import { GNB_MITS } from "./gnb";
import { MCH_MITS } from "./mch";
import { MNK_MITS } from "./mnk";
import { NIN_MITS } from "./nin";
import { PCT_MITS } from "./pct";
import { PLD_MITS } from "./pld";
import { RDM_MITS } from "./rdm";
import { RPR_MITS } from "./rpr";
import { SAM_MITS } from "./sam";
import { SCH_MITS } from "./sch";
import { SGE_MITS } from "./sge";
import { SMN_MITS } from "./smn";
import { VPR_MITS } from "./vpr";
import { WAR_MITS } from "./war";
import { WHM_MITS } from "./whm";

export const MIT_LIBRARY: readonly MitigationType[] = [
  ...PLD_MITS,
  ...WAR_MITS,
  ...DRK_MITS,
  ...GNB_MITS,
  ...WHM_MITS,
  ...SCH_MITS,
  ...AST_MITS,
  ...SGE_MITS,
  ...MNK_MITS,
  ...DRG_MITS,
  ...NIN_MITS,
  ...SAM_MITS,
  ...RPR_MITS,
  ...VPR_MITS,
  ...BRD_MITS,
  ...MCH_MITS,
  ...DNC_MITS,
  ...BLM_MITS,
  ...SMN_MITS,
  ...RDM_MITS,
  ...PCT_MITS,
];

const BY_ID: ReadonlyMap<string, MitigationType> = new Map(MIT_LIBRARY.map((m) => [m.id, m]));

export function getMitById(id: string): MitigationType | undefined {
  return BY_ID.get(id);
}

export function getMitsForJob(job: Job): MitigationType[] {
  return MIT_LIBRARY.filter((m) => m.job === job);
}
