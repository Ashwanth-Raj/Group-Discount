import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      products(first: 50) {
        nodes {
          id
          title
          totalInventory
          featuredImage {
            url
          }
          variants(first: 1) {
            nodes {
              price
            }
          }
        }
      }
    }
  `);

  const json = await response.json();

  const products = json.data.products.nodes.map((product) => ({
    id: product.id,
    title: product.title,
    totalInventory: product.totalInventory,
    image: product.featuredImage?.url,
    price: product.variants.nodes[0]?.price ?? "0.00",
  }));

  const metafieldResponse = await admin.graphql(`
    query {
      shop {
        metafield(namespace: "custom", key: "settings") {
          value
        }
      }
    }
  `);

  const metafieldJson = await metafieldResponse.json();

  const savedConfig = metafieldJson.data.shop.metafield?.value
    ? JSON.parse(metafieldJson.data.shop.metafield.value)
    : null;

  return {
    products,
    savedConfig,
  };
};

async function ensureCustomerMetafieldDefinition(admin) {
  const checkResponse = await admin.graphql(`
    query {
      metafieldDefinitions(
        first: 1
        ownerType: CUSTOMER
        namespace: "customer_discount"
        key: "group"
      ) {
        nodes {
          id
        }
      }
    }
  `);

  const checkJson = await checkResponse.json();

  const exists = checkJson?.data?.metafieldDefinitions?.nodes?.length > 0;

  if (!exists) {
    await admin.graphql(`
      mutation {
        metafieldDefinitionCreate(
          definition: {
            name: "Customer Group Discount"
            namespace: "customer_discount"
            key: "group"
            type: "single_line_text_field"
            ownerType: CUSTOMER
            description: "Stores customer discount group"
          }
        ) {
          createdDefinition { id }
        }
      }
    `);
  }
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  await ensureCustomerMetafieldDefinition(admin);
  const { groups, excludedIds } = await request.json();
  const shopRes = await admin.graphql(`
    query {
      shop {
        id
      }
    }
  `);

  const { data } = await shopRes.json();
  const shopId = data.shop.id;

  await admin.graphql(
    `mutation SaveSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          message
        }
      }
    }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: "custom",
            key: "settings",
            type: "json",
            value: JSON.stringify({ groups, excludedProductIds: excludedIds }),
          },
        ],
      },
    },
  );

  return { success: true };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved");
    }
  }, [fetcher.data, shopify]);

  const { products, savedConfig } = useLoaderData();

  const [groups, setGroups] = useState(
    savedConfig.groups ?? [{ name: "tier1", discount: 20 }],
  );
  const [activeTab, setActiveTab] = useState("add");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [excludedIds, setExcludedIds] = useState(
    savedConfig?.excludedProductIds ?? [],
  );

  const addedProducts = products.filter((p) => excludedIds.includes(p.id));

  const toggleProduct = (productId) => {
    if (selected.includes(productId)) {
      setSelected(selected.filter((id) => id !== productId));
    } else {
      setSelected([...selected, productId]);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) &&
      !excludedIds.includes(p.id),
  );

  const removeProduct = (id) => {
    setExcludedIds((prev) => prev.filter((pid) => pid !== id));
  };

  const handleAdd = () => {
    setExcludedIds((prev) => [...prev, ...selected]);
    setSelected([]);
  };

  const addGroup = () => {
    if (groups.length < 10) {
      setGroups([...groups, { name: "", discount: 0 }]);
    }
  };

  const removeGroup = () => {
    if (groups.length > 1) {
      setGroups(groups.slice(0, -1));
    }
  };

  const handleCancel = () => {
    setSearch("");
    setSelected([]);
    setActiveTab("add");
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredProducts.map((p) => p.id);

    if (selected.length === visibleIds.length) {
      setSelected([]);
    } else {
      setSelected(visibleIds);
    }
  };

  const trimmedNames = groups.map((g) => g.name?.trim());

  const hasEmpty = trimmedNames.some((name) => !name);

  const hasDuplicate = new Set(trimmedNames).size !== trimmedNames.length;

  const isInvalid = hasEmpty || hasDuplicate;

  const removeAllProducts = () => {
    setExcludedIds([]);
  };
  const saveDetails = () => {
    fetcher.submit(
      JSON.stringify({
        groups,
        excludedIds,
      }),
      {
        method: "POST",
        encType: "application/json",
      },
    );
  };

  return (
    <s-page heading="Group Discount">
      <s-section>
        <s-stack>
          <h2>Discount Configuration</h2>
          <s-text>
            **Group indicates the label for the cart page discount name you
            provide below.**
          </s-text>

          <s-divider />
          <s-stack
            direction="inline"
            alignItems="center"
            justifyContent="left"
            padding="small-100"
          >
            <s-box inlineSize="250px">
              <s-heading>Groups</s-heading>
            </s-box>

            <s-box inlineSize="230px">
              <s-heading>Discount(%)</s-heading>
            </s-box>
          </s-stack>
          {groups.map((group, index) => (
            <s-stack direction="inline" key={index}>
              <s-box inlineSize="230px" padding="small-200">
                <s-text-field
                  value={group.name}
                  onInput={(e) => {
                    const updated = [...groups];
                    updated[index].name = e.target.value;
                    setGroups(updated);
                  }}
                />
              </s-box>

              <s-box inlineSize="200px" padding="small-200">
                <s-number-field
                  value={group.discount}
                  min={0}
                  max={100}
                  step={1}
                  onInput={(e) => {
                    const updated = [...groups];
                    updated[index].discount = Number(e.target.value);
                    setGroups(updated);
                  }}
                />
              </s-box>
              {index === groups.length - 1 && (
                <s-stack gap="200" direction="inline" padding="small-200">
                  <s-box inlineSize="40px">
                    <s-button onClick={addGroup} disabled={groups.length >= 10}>
                      +
                    </s-button>
                  </s-box>
                  <s-box>
                    <s-button
                      onClick={removeGroup}
                      disabled={groups.length <= 1}
                    >
                      -
                    </s-button>
                  </s-box>
                </s-stack>
              )}
            </s-stack>
          ))}
          <s-stack padding="base">
            <s-button commandFor="modal" variant="primary">
              Exclude Product
            </s-button>

            <s-modal id="modal" heading="Select Product" onHide={handleCancel}>
              <s-stack direction="inline" gap="small">
                <s-button
                  variant={activeTab === "add" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("add")}
                >
                  Add Product
                </s-button>

                <s-button
                  variant={activeTab === "added" ? "primary" : "secondary"}
                  onClick={() => setActiveTab("added")}
                >
                  Added Products
                </s-button>
              </s-stack>

              {activeTab === "add" && (
                <>
                  <s-box padding="small-200">
                    <s-search-field
                      placeholder="Search products"
                      value={search}
                      onInput={(e) => setSearch(e.target.value)}
                      padding="base"
                    />
                  </s-box>
                  <s-stack direction="inline" alignItems="center" gap="small">
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.length > 0 &&
                        selected.length === filteredProducts.length
                      }
                      onChange={toggleSelectAll}
                    />
                    <s-text>Select All</s-text>
                  </s-stack>

                  <div>
                    {filteredProducts.map((product) => (
                      <s-stack
                        key={product.id}
                        direction="inline"
                        justifyContent="space-between"
                        alignItems="center"
                        padding="small-200"
                      >
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                        >
                          <input
                            type="checkbox"
                            checked={selected.includes(product.id)}
                            onChange={() => toggleProduct(product.id)}
                          />

                          <img
                            src={product.image}
                            width="40"
                            height="40"
                            alt="Product-img"
                          />

                          <s-stack gap="extra-tight">
                            <s-text>{product.title}</s-text>
                            <s-text tone="subdued">
                              {product.totalInventory ?? 0} available
                            </s-text>
                          </s-stack>
                        </s-stack>

                        <s-heading>${product.price}</s-heading>
                        <s-divider />
                      </s-stack>
                    ))}
                  </div>
                </>
              )}

              {activeTab === "added" && (
                <div>
                  {addedProducts.length === 0 && (
                    <s-text>No excluded products added.</s-text>
                  )}
                  {addedProducts.length > 0 && (
                    <s-box padding="small-200">
                      <s-button
                        variant="secondary"
                        tone="critical"
                        onClick={removeAllProducts}
                      >
                        Remove All
                      </s-button>
                    </s-box>
                  )}
                  {addedProducts.map((product) => (
                    <s-stack
                      key={product.id}
                      direction="inline"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <s-stack
                        direction="inline"
                        gap="base"
                        alignItems="center"
                      >
                        <img
                          src={product.image}
                          width="40"
                          height="40"
                          alt="Product-img"
                        />
                        <s-text>{product.title}</s-text>
                      </s-stack>

                      <s-button
                        variant="secondary"
                        onClick={() => removeProduct(product.id)}
                      >
                        Remove
                      </s-button>
                      <s-divider />
                    </s-stack>
                  ))}
                </div>
              )}

              <s-button
                slot="secondary-actions"
                commandFor="modal"
                command="--hide"
                onClick={handleCancel}
              >
                Cancel
              </s-button>

              <s-button
                slot="primary-action"
                variant="primary"
                onClick={handleAdd}
                commandFor="modal"
                command="--hide"
                disabled={selected.length === 0}
              >
                Add
              </s-button>
            </s-modal>
            <s-text>
              **Selected products will be excluded from discount.**
            </s-text>
          </s-stack>
        </s-stack>
        <s-stack direction="block" gap="200">
          {(hasEmpty || hasDuplicate) && (
            <s-text tone="critical">
              Group name cannot be empty or duplicate.
            </s-text>
          )}
          <s-button
            onClick={saveDetails}
            loading={isLoading}
            disabled={isInvalid}
          >
            Submit
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
