import { Bar, Frame, Glyph, Label } from "./primitives";

/** Full settings dialog so Connectors can be found by eye. */
export function Connectors() {
  return (
    <Frame>
      <rect
        x="6"
        y="8"
        width="196"
        height="114"
        rx="7"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />

      <rect
        x="10"
        y="12"
        width="80"
        height="106"
        rx="5"
        className="fill-muted/70"
      />

      <Label x={17} y={25} size={6.5} tone="muted" weight={600}>
        Settings
      </Label>
      <Bar x={17} y={31} width={46} />
      <Bar x={17} y={38} width={38} />
      <Bar x={17} y={45} width={44} />

      <Label x={17} y={60} size={6.5} tone="muted" weight={600}>
        Desktop app
      </Label>
      <Bar x={17} y={66} width={40} />
      <Bar x={17} y={73} width={34} />

      {/* Customize is a section heading; Connectors under it is the click target. */}
      <Label x={17} y={88} size={7} tone="muted" weight={700}>
        Customize
      </Label>
      <Bar x={17} y={94} width={28} />

      <rect
        x="13"
        y="99"
        width="74"
        height="15"
        rx="4"
        className="fill-brand-lime"
      />
      <Label x={19} y={109} size={7.5} tone="onLime" weight={700}>
        Connectors
      </Label>

      <Label x={98} y={27} size={8} weight={600}>
        Connectors
      </Label>
      <rect
        x="162"
        y="17"
        width="32"
        height="13"
        rx="4"
        className="fill-background stroke-border"
        strokeWidth="1"
      />
      <Label x={168} y={26} size={6} tone="muted">
        Add
      </Label>

      {[40, 60, 80, 100].map((y) => (
        <g key={y}>
          <rect
            x="98"
            y={y}
            width="96"
            height="15"
            rx="4"
            className="fill-muted/60"
          />
          <Glyph x={103} y={y + 4} size={6} />
          <Bar x={114} y={y + 6} width={44} />
        </g>
      ))}
    </Frame>
  );
}

/** Add button (top right) and the menu it opens. */
export function AddConnector() {
  return (
    <Frame>
      <Label x={14} y={30} size={10} weight={600}>
        Connectors
      </Label>

      <rect
        x="140"
        y="18"
        width="54"
        height="19"
        rx="6"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <Label x={154} y={31} size={9}>
        Add
      </Label>
      <path
        d="M178 26 L181.5 29.5 L185 26"
        className="stroke-foreground"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />

      <rect
        x="78"
        y="44"
        width="116"
        height="48"
        rx="6"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <Glyph x={86} y={51} />
      <Label x={100} y={59} size={8} tone="muted">
        Browse connectors
      </Label>
      <rect
        x="82"
        y="68"
        width="108"
        height="19"
        rx="5"
        className="fill-brand-lime"
      />
      <circle
        cx="88"
        cy="77.5"
        r="1.2"
        className="fill-brand-lime-foreground"
      />
      <circle
        cx="92"
        cy="77.5"
        r="1.2"
        className="fill-brand-lime-foreground"
      />
      <circle
        cx="96"
        cy="77.5"
        r="1.2"
        className="fill-brand-lime-foreground"
      />
      <Label x={101} y={81} size={7.6} tone="onLime" weight={600}>
        Add custom connector
      </Label>
    </Frame>
  );
}

/** Modal with Name + URL filled; advanced OAuth fields left blank on purpose. */
export function PasteAddress() {
  return (
    <Frame>
      <Label x={14} y={20} size={9.5} weight={600}>
        Add custom connector
      </Label>

      <rect
        x="14"
        y="27"
        width="180"
        height="19"
        rx="5"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <Label x={22} y={40} size={8.5} weight={400}>
        AI Catalyst
      </Label>

      <rect
        x="14"
        y="50"
        width="180"
        height="19"
        rx="5"
        className="fill-background stroke-brand-lime"
        strokeWidth="2"
      />
      {/* "Copied" points at the Copy button; avoid left/right directions. */}
      <Label x={22} y={63} size={8} weight={400}>
        Paste the copied address
      </Label>
      <rect
        x="134"
        y="54"
        width="1.6"
        height="11"
        className="fill-brand-lime"
      />

      <path
        d="M15 82 L18.5 78.5 L22 82"
        className="stroke-muted-foreground"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <Label x={27} y={83} size={7.5} tone="muted">
        Advanced settings
      </Label>

      {[88, 108].map((y, index) => (
        <g key={y}>
          <rect
            x="14"
            y={y}
            width="180"
            height="17"
            rx="5"
            className="fill-background/50 stroke-border"
            strokeWidth="1"
          />
          <Label x={22} y={y + 11} size={7} tone="faint" weight={400}>
            {index === 0 ? "OAuth Client ID" : "OAuth Client Secret"}
          </Label>
        </g>
      ))}
    </Frame>
  );
}

/** Our /oauth/consent screen — Allow/Deny match consent-form.tsx. */
export function Approve() {
  return (
    <Frame>
      <rect
        x="10"
        y="15"
        width="188"
        height="18"
        rx="5"
        className="fill-background/70"
      />
      <circle cx="21" cy="24" r="2.4" className="fill-muted-foreground/30" />
      <circle cx="29" cy="24" r="2.4" className="fill-muted-foreground/30" />
      <circle cx="37" cy="24" r="2.4" className="fill-muted-foreground/30" />
      <rect
        x="48"
        y="19.5"
        width="86"
        height="9"
        rx="4.5"
        className="fill-muted-foreground/15"
      />

      <rect
        x="24"
        y="42"
        width="160"
        height="72"
        rx="7"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <Label x={36} y={60} size={9.5} weight={600}>
        Claude wants to connect
      </Label>
      <Bar x={36} y={68} width={128} height={5} />
      <Bar x={36} y={78} width={92} height={5} />

      <rect
        x="36"
        y="89"
        width="62"
        height="18"
        rx="9"
        className="fill-brand-lime"
      />
      <Label
        x={67}
        y={101}
        size={9.5}
        weight={600}
        tone="onLime"
        anchor="middle"
      >
        Allow
      </Label>
      <rect
        x="104"
        y="89"
        width="62"
        height="18"
        rx="9"
        className="fill-transparent stroke-border"
        strokeWidth="1.2"
      />
      <Label x={135} y={101} size={9.5} tone="muted" anchor="middle">
        Deny
      </Label>
    </Frame>
  );
}

/** Connector detail page — Always allow on the tool-permissions group. */
export function AllowTools() {
  return (
    <Frame>
      <path
        d="M18 19 L14.5 22.5 L18 26"
        className="stroke-muted-foreground"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
      <Label x={22} y={25} size={7} tone="muted">
        Connectors
      </Label>

      <rect
        x="14"
        y="32"
        width="13"
        height="13"
        rx="3.5"
        className="fill-brand-lime"
      />
      <Label x={32} y={43} size={9.5} weight={700}>
        AI Catalyst
      </Label>
      <rect
        x="138"
        y="31"
        width="56"
        height="15"
        rx="7.5"
        className="fill-background stroke-border"
        strokeWidth="1.1"
      />
      <Label x={166} y={41} size={6.8} tone="muted" anchor="middle">
        Disconnect
      </Label>
      <Label x={14} y={57} size={6.5} tone="faint" weight={400}>
        your workspace address
      </Label>

      <Label x={14} y={74} size={8.5} weight={600}>
        Tool permissions
      </Label>

      <Label x={14} y={92} size={8} tone="muted">
        Other tools
      </Label>
      <rect
        x="110"
        y="82"
        width="84"
        height="16"
        rx="8"
        className="fill-brand-lime"
      />
      <Label x={152} y={93} size={8} weight={600} tone="onLime" anchor="middle">
        Always allow
      </Label>

      {[108, 122].map((y, index) => (
        <g key={y}>
          <Label x={16} y={y + 3} size={7.5} tone="muted" weight={400}>
            {["List modules", "Save artifact"][index]}
          </Label>
          <circle
            cx="156"
            cy={y}
            r="4.2"
            className="fill-transparent stroke-brand-lime"
            strokeWidth="1.3"
          />
          <circle
            cx="172"
            cy={y}
            r="4.2"
            className="fill-muted-foreground/20"
          />
          <circle
            cx="188"
            cy={y}
            r="4.2"
            className="fill-muted-foreground/20"
          />
        </g>
      ))}
    </Frame>
  );
}
