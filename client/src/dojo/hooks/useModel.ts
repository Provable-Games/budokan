import { useDojoStore } from "@/dojo/hooks/useDojoStore";
import { SchemaType } from "@/generated/models.gen";
import { addAddressPadding } from "starknet";

/**
 * Custom hook to retrieve a specific model for a given entityId within a specified namespace.
 *
 * @param entityId - The ID of the entity.
 * @param model - The model to retrieve, specified as a string in the format "namespace-modelName".
 * @returns The model structure if found, otherwise undefined.
 */
function useModel<
  N extends keyof SchemaType,
  M extends keyof SchemaType[N] & keyof SchemaType[N] & string
>(entityId: string, model: `${N}-${M}`): SchemaType[N][M] {
  const [namespace, modelName] = model.split("-") as [N, M];

  // Subscribe to the store and select the specific model data
  const modelData = useDojoStore(
    (state) =>
      state.entities[addAddressPadding(entityId)]?.models?.[namespace]?.[
        modelName
      ] as unknown as SchemaType[N][M]
  );

  return modelData;
}

export default useModel;
