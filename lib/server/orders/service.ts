import { z } from "zod";

import { createDemoOrder, DEMO_ORDER_REFERENCE } from "./demo";
import {
  createInsForgeOrderRepository,
  OrderRepositoryUnavailableError,
  type TalosOrderRepository,
} from "./repository";
import type { TalosOrderReadModel } from "./types";

const publicReferenceSchema = z
  .string()
  .trim()
  .regex(/^TAL-[A-Z0-9]{2,48}$/);

export type OrderLookupResult =
  | { status: 200; body: TalosOrderReadModel }
  | {
      status: 400 | 404 | 503;
      body: {
        error: "INVALID_ORDER_REFERENCE" | "ORDER_NOT_FOUND" | "ORDER_LEDGER_UNAVAILABLE";
        message: string;
      };
    };

interface OrderLookupDependencies {
  environment?: Record<string, string | undefined>;
  repositoryFactory?: (
    environment: Record<string, string | undefined>,
  ) => TalosOrderRepository;
}

export async function lookupOrder(
  rawReference: string,
  dependencies: OrderLookupDependencies = {},
): Promise<OrderLookupResult> {
  const referenceResult = publicReferenceSchema.safeParse(rawReference);
  if (!referenceResult.success) {
    return {
      status: 400,
      body: {
        error: "INVALID_ORDER_REFERENCE",
        message: "The order reference is invalid.",
      },
    };
  }

  const reference = referenceResult.data;
  const environment = dependencies.environment ?? process.env;
  const repositoryFactory =
    dependencies.repositoryFactory ?? createInsForgeOrderRepository;

  try {
    const order = await repositoryFactory(environment).findByPublicReference(
      reference,
    );
    if (!order) {
      return {
        status: 404,
        body: {
          error: "ORDER_NOT_FOUND",
          message: "No order exists for that reference.",
        },
      };
    }
    return { status: 200, body: order };
  } catch (error) {
    if (
      error instanceof OrderRepositoryUnavailableError &&
      reference === DEMO_ORDER_REFERENCE
    ) {
      return { status: 200, body: createDemoOrder(error.reason) };
    }

    return {
      status: 503,
      body: {
        error: "ORDER_LEDGER_UNAVAILABLE",
        message: "The order ledger is temporarily unavailable.",
      },
    };
  }
}
