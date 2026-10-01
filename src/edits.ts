import { type Static, Type } from "@earendil-works/pi-ai";
import {
  apply,
  type ContextDocument,
  RejectedEdit,
  type Snapshot,
} from "./document.ts";

const before = Type.Union([Type.String(), Type.Null()]);
const strict = { additionalProperties: false };
export const editParameters = Type.Object(
  {
    generation: Type.String(),
    operations: Type.Array(
      Type.Union([
        Type.Object(
          {
            op: Type.Literal("replace"),
            unit: Type.String(),
            message: Type.String(),
            slot: Type.String(),
            text: Type.String(),
          },
          strict,
        ),
        Type.Object(
          { op: Type.Literal("delete"), unit: Type.String() },
          strict,
        ),
        Type.Object(
          { op: Type.Literal("move"), unit: Type.String(), before },
          strict,
        ),
        Type.Object(
          {
            op: Type.Literal("note"),
            id: Type.String(),
            text: Type.String(),
            before,
          },
          strict,
        ),
      ]),
      { minItems: 1 },
    ),
  },
  strict,
);
export type EditParameters = Static<typeof editParameters>;

export function proposal(
  params: EditParameters,
  current: Snapshot,
): ContextDocument {
  if (params.generation !== current.document.generation)
    throw new RejectedEdit("stale generation");
  const candidate = structuredClone(current.document);
  for (const op of params.operations) {
    if (op.op === "note") {
      if (candidate.units.some((unit) => unit.id === op.id))
        throw new RejectedEdit("duplicate unit ID");
      insert({ kind: "note", id: op.id, text: op.text }, op.before);
      continue;
    }
    const index = candidate.units.findIndex((unit) => unit.id === op.unit);
    const unit = candidate.units[index];
    if (!unit) throw new RejectedEdit("unknown unit ID");
    if (op.op === "delete") candidate.units.splice(index, 1);
    else if (op.op === "move") {
      if (op.before === op.unit)
        throw new RejectedEdit("cannot move before itself");
      candidate.units.splice(index, 1);
      insert(unit, op.before);
    } else {
      const message =
        unit.kind === "source"
          ? unit.messages.find((m) => m.id === op.message)
          : undefined;
      const slot = message?.texts.find((s) => s.slot === op.slot);
      if (!slot) throw new RejectedEdit("unknown message or slot ID");
      slot.text = op.text;
    }
  }
  // Reuse the full document validator, including immutable exchange structure.
  apply(JSON.stringify(candidate), current);
  if (JSON.stringify(candidate) === JSON.stringify(current.document))
    throw new RejectedEdit("no-op proposal");
  return candidate;

  function insert(
    unit: ContextDocument["units"][number],
    before: string | null,
  ) {
    const index =
      before === null
        ? candidate.units.length
        : candidate.units.findIndex((u) => u.id === before);
    if (index < 0) throw new RejectedEdit("unknown before unit ID");
    candidate.units.splice(index, 0, unit);
  }
}
