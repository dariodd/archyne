import type { DiagramKind } from "./model/types";
import type { MessageKey } from "./i18n";

export interface Template {
  id: string;
  kind: DiagramKind;
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  code: string;
}

/**
 * Starting points that show what each diagram family is *for*.
 *
 * `NEW_DIAGRAM` in the store gives two-node stubs, which prove nothing: a new
 * user sees an empty canvas and has to already know the syntax. These are
 * small but complete — recognisable shapes a reader can edit into their own
 * case rather than build from nothing.
 *
 * Deliberately no `%% graph:positions` line: these lay out with ELK on open,
 * so they look right at any window size instead of carrying coordinates
 * chosen on somebody else's screen.
 */
export const TEMPLATES: Template[] = [
  {
    id: "approval",
    kind: "flowchart",
    nameKey: "tpl.approval",
    descriptionKey: "tpl.approvalDesc",
    code: `flowchart TD
  submit[/"Submit request"/]
  review{"Manager approves?"}
  budget{"Over budget?"}
  finance["Finance review"]
  approved(["Approved"])
  rejected(["Rejected"])

  submit --> review
  review -->|"yes"| budget
  review -->|"no"| rejected
  budget -->|"yes"| finance
  budget -->|"no"| approved
  finance -->|"signed off"| approved
  finance -->|"declined"| rejected
`,
  },
  {
    id: "auth",
    kind: "sequence",
    nameKey: "tpl.auth",
    descriptionKey: "tpl.authDesc",
    code: `sequenceDiagram
  actor U as User
  participant A as App
  participant S as Auth service
  participant D as Database

  U->>A: Sign in
  A->>S: POST /token
  S->>D: Look up account
  D-->>S: Account
  alt credentials valid
    S-->>A: Access token
    A-->>U: Signed in
  else invalid
    S-->>A: 401
    A-->>U: Show error
  end
`,
  },
  {
    id: "orders",
    kind: "er",
    nameKey: "tpl.orders",
    descriptionKey: "tpl.ordersDesc",
    code: `erDiagram
  CUSTOMER {
    string id PK
    string email "unique"
    string name
  }
  ORDER {
    string id PK
    string customer_id FK
    date placed_at
    string status
  }
  LINE_ITEM {
    string id PK
    string order_id FK
    int quantity
  }
  PRODUCT {
    string sku PK
    string name
    decimal price
  }

  CUSTOMER ||--o{ ORDER : "places"
  ORDER ||--|{ LINE_ITEM : "contains"
  PRODUCT ||--o{ LINE_ITEM : "appears in"
`,
  },
  {
    id: "webapp",
    kind: "architecture",
    nameKey: "tpl.webapp",
    descriptionKey: "tpl.webappDesc",
    code: `architecture-beta
  group cloud(cloud)[Cloud]
  group data(database)[Data] in cloud

  service users(internet)[Users]
  service cdn(server)[CDN] in cloud
  service api(server)[API] in cloud
  service db(database)[Postgres] in data
  service cache(disk)[Redis] in data

  users:R --> L:cdn
  cdn:R --> L:api
  api:R --> L:db
  api:B --> T:cache
`,
  },
  {
    id: "order-state",
    kind: "state",
    nameKey: "tpl.orderState",
    descriptionKey: "tpl.orderStateDesc",
    code: `stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted : submit
  Submitted --> Paid : payment cleared
  Submitted --> Cancelled : cancel
  Paid --> Shipped : dispatch
  Shipped --> Delivered : signed for
  Delivered --> [*]
  Cancelled --> [*]
`,
  },
  {
    id: "domain",
    kind: "class",
    nameKey: "tpl.domain",
    descriptionKey: "tpl.domainDesc",
    code: `classDiagram
  class Account {
    +string id
    +string email
    +suspend() void
  }
  class Subscription {
    +string plan
    +date renewsAt
    +cancel() void
  }
  class Invoice {
    +decimal total
    +bool paid
  }

  Account "1" --> "0..*" Subscription : has
  Subscription "1" --> "0..*" Invoice : bills
`,
  },
  {
    id: "context",
    kind: "c4",
    nameKey: "tpl.context",
    descriptionKey: "tpl.contextDesc",
    code: `C4Context
  title System context

  Person(customer, "Customer", "Places orders")
  Person(staff, "Support agent", "Handles queries")
  System(shop, "Shop", "Storefront and checkout")
  System_Ext(payments, "Payment provider", "Card processing")
  System_Ext(email, "Email service", "Transactional mail")

  Rel(customer, shop, "Browses and buys")
  Rel(staff, shop, "Looks up orders")
  Rel(shop, payments, "Charges cards", "HTTPS")
  Rel(shop, email, "Sends receipts", "SMTP")
`,
  },
];
