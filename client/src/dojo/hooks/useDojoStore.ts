import { createDojoStore } from "@dojoengine/sdk/react";
import { SchemaType } from "@/generated/models.gen";
import { GameState } from "@dojoengine/sdk/state";

export type DojoStoreHook<T extends SchemaType> = <U>(
  selector: (state: GameState<T>) => U,
  equals?: (a: U, b: U) => boolean
) => U;

export const useDojoStore: DojoStoreHook<SchemaType> =
  createDojoStore<SchemaType>();
