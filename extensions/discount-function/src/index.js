export * from './cart_lines_discounts_generate_run';
export * from './cart_delivery_options_discounts_generate_run';


// mutation {
//   discountAutomaticAppCreate(
//     automaticAppDiscount: {
//       title: "Customer Group Automatic Discount"
//       functionHandle: "discount-function"
//       startsAt: "2026-01-01T00:00:00Z"
//       discountClasses: [ORDER]
//       combinesWith: {
//         orderDiscounts: true
//         productDiscounts: true
//         shippingDiscounts: true
//       }
//     }
//   ) {
//     automaticAppDiscount {
//       discountId
//       title
//       status
//     }
//     userErrors {
//       field
//       message
//     }
//   }
// }
