import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
} from "../generated/api";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */

export function cartLinesDiscountsGenerateRun(input) {
  if (!input.discount.discountClasses?.includes(DiscountClass.Order)) {
    return { operations: [] };
  }

  const groupName = input.cart.buyerIdentity?.customer?.metafield?.value;
  if (!groupName) return { operations: [] };

  const config = input.shop?.metafield?.jsonValue;
  if (!config?.groups?.length) return { operations: [] };

  let discount = null;

  for (const g of config.groups) {
    if (g.name === groupName && typeof g.discount === "number") {
      discount = g.discount;
      break;
    }
  }

  if (discount === null) return { operations: [] };

  const excludedIds = config.excludedProductIds || [];
  const excludedLineIds = [];

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") continue;

    const productId = line.merchandise.product?.id;
    if (!productId) continue;

    if (excludedIds.includes(productId)) {
      excludedLineIds.push(line.id);
    }
  }

  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy: OrderDiscountSelectionStrategy.First,
          candidates: [
            {
              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: excludedLineIds,
                  },
                },
              ],
              value: {
                percentage: {
                  value: String(discount),
                },
              },
              message: `${discount}% Group Discount`,
            },
          ],
        },
      },
    ],
  };
}
