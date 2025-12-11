import { useEffect, useMemo, useState } from "react";
import {
  BigNumberish,
  CairoOption,
  CairoCustomEnum,
  CairoOptionVariant,
} from "starknet";
import { ParsedEntity } from "@dojoengine/sdk";
import { useDojo } from "@/context/dojo";
import { SchemaType } from "@/generated/models.gen";
import { useDojoStore } from "@/dojo/hooks/useDojoStore";
import { addAddressPadding } from "starknet";
import type * as torii from "@dojoengine/torii-wasm/types";

export type EntityResult<N extends string = string> = {
  entityId: BigNumberish;
} & Partial<SchemaType[N]>;

export type UseSdkSubEntitiesResult = {
  entities: EntityResult[] | null;
  isSubscribed: boolean;
  error?: Error | null;
};

export type UseSdkSubEntitiesProps = {
  query: any;
  logging?: boolean;
  enabled?: boolean;
};

function parseCustomEnum(value: torii.Ty): CairoCustomEnum | string {
  // enum is a simple enum
  if ((value.value as torii.EnumValue).value.type === "tuple") {
    // we keep retrocompatibility
    return (value.value as torii.EnumValue).option;
  }

  return new CairoCustomEnum({
    [(value.value as torii.EnumValue).option]: parseValue(
      (value.value as torii.EnumValue).value
    ),
  });
}

function parseValue(value: torii.Ty): any {
  switch (value.type) {
    case "primitive":
      return parsePrimitive(value);
    case "struct":
      return parseStruct(
        value.value as Record<string, torii.Ty> | Map<string, torii.Ty>
      );
    case "enum":
      // Handling Options
      if ("Some" === (value.value as torii.EnumValue).option) {
        return new CairoOption(
          CairoOptionVariant.Some,
          parseValue((value.value as torii.EnumValue).value)
        );
      }
      if ("None" === (value.value as torii.EnumValue).option) {
        return new CairoOption(CairoOptionVariant.None);
      }

      // Handling simple enum as default case
      // Handling CairoCustomEnum for more complex types
      return parseCustomEnum(value);
    case "tuple":
    case "array":
      return (value.value as torii.Ty[]).map(parseValue);
    default:
      return value.value;
  }
}

function parsePrimitive(value: torii.Ty): any {
  switch (value.type_name) {
    case "u64":
    case "i64":
      return Number(value.value as string);
    case "u128":
    case "i128":
      return BigInt(value.value as string);
    case "u256":
      return BigInt(value.value as string);
    case "u8":
    case "u16":
    case "u32":
    case "i8":
    case "i16":
    case "i32":
    case "bool":
    case "ContractAddress":
    case "ClassHash":
    case "felt252":
    case "EthAddress":
    default:
      return value.value;
  }
}

function parseStruct(
  struct: Record<string, torii.Ty> | Map<string, torii.Ty>
): any {
  const entries =
    struct instanceof Map
      ? Array.from(struct.entries())
      : Object.entries(struct);
  return Object.fromEntries(
    entries.map(([key, value]) => [key, parseValue(value)])
  );
}

export const useSdkSubscribeEntities = ({
  query,
  enabled = true,
}: UseSdkSubEntitiesProps): UseSdkSubEntitiesResult => {
  const { sdk } = useDojo();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [entities, setEntities] = useState<EntityResult[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const state = useDojoStore((state) => state);

  const memoizedQuery = useMemo(() => {
    return query;
  }, [query]);

  console.log(memoizedQuery);

  useEffect(() => {
    let _unsubscribe: (() => void) | undefined;

    const _subscribe = async () => {
      if (!memoizedQuery) {
        setIsSubscribed(false);
        setEntities(null);
        return;
      }

      try {
        const subscription = await sdk.client.onEventMessageUpdated(
          memoizedQuery,
          (response: any) => {
            console.log("Subscription response:", response);
            if (response.error) {
              console.error(
                "useSdkSubscribeEntities() error:",
                response.error.message
              );
              setError(new Error(response.error.message));
            } else if (response.models) {
              const entityId = addAddressPadding(response.hashed_keys);
              const entityData = response.models;
              const parsedEntity: ParsedEntity<SchemaType> = {
                entityId,
                models: {} as ParsedEntity<SchemaType>["models"],
              };

              for (const modelName in response.models) {
                const [schemaKey, modelKey] = modelName.split("-") as [
                  keyof SchemaType,
                  string
                ];

                if (!schemaKey || !modelKey) {
                  console.warn(`Invalid modelName format: ${modelName}`);
                  continue;
                }

                if (!parsedEntity.models[schemaKey]) {
                  parsedEntity.models[schemaKey] =
                    {} as SchemaType[typeof schemaKey];
                }

                (parsedEntity.models[schemaKey] as any)[modelKey] = parseStruct(
                  entityData[modelName]
                );
              }

              console.log("Parsed entity:", parsedEntity);
              state.updateEntity(
                parsedEntity as Partial<ParsedEntity<SchemaType>>
              );
            }
          }
        );

        setIsSubscribed(true);
        setError(null);
        _unsubscribe = () => subscription.cancel();
      } catch (err) {
        console.error("Failed to subscribe to entity query:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsSubscribed(false);
        setEntities(null);
      }
    };

    setIsSubscribed(false);
    if (enabled && memoizedQuery) {
      _subscribe();
    } else {
      setEntities(null);
    }

    return () => {
      setIsSubscribed(false);
      if (_unsubscribe) {
        try {
          _unsubscribe();
        } catch (err) {
          console.error("Error during unsubscribe:", err);
        }
      }
      _unsubscribe = undefined;
    };
  }, [sdk, memoizedQuery, enabled]);

  return {
    entities,
    isSubscribed,
    error,
  };
};
