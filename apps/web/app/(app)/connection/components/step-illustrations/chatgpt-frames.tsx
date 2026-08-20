import { Bar, Frame, Glyph, Label } from "./primitives";

// ChatGPT's half of the wireframes. Separate file from frames.tsx purely
// on size — same primitives, same 208×130 canvas, same rule that these are
// schematics rather than screenshots.
//
// This route needs the diagrams more than Claude's does: the deep link
// stops at the settings window, so steps 2 and 3 are navigation a founder
// has to do by eye.

/** Settings window, Plugins highlighted under the Integrations heading. */
export function ChatgptSettings() {
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
        Personal
      </Label>
      <Bar x={17} y={31} width={44} />
      <Bar x={17} y={38} width={36} />
      <Bar x={17} y={45} width={42} />
      <Bar x={17} y={52} width={34} />

      {/* Integrations is the section heading; Plugins under it is the target. */}
      <Label x={17} y={68} size={7} tone="muted" weight={700}>
        Integrations
      </Label>

      <rect
        x="13"
        y="73"
        width="74"
        height="15"
        rx="4"
        className="fill-brand-lime"
      />
      <Label x={19} y={83} size={7.5} tone="onLime" weight={700}>
        Plugins
      </Label>

      <Bar x={17} y={95} width={30} />
      <Bar x={17} y={102} width={40} />

      <Label x={98} y={27} size={8} weight={600}>
        Settings
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

/** The Plugins page with the MCPs tab selected and Add server in reach. */
export function ChatgptPlugins() {
  return (
    <Frame>
      <Label x={14} y={24} size={10} weight={600}>
        Plugins
      </Label>
      <Label x={14} y={34} size={6.5} tone="faint" weight={400}>
        Manage plugins, skills, and MCPs
      </Label>

      {/* Tab strip. MCPs is filled; the rest are outlines. */}
      <rect
        x="14"
        y="44"
        width="34"
        height="15"
        rx="7.5"
        className="fill-transparent stroke-border"
        strokeWidth="1"
      />
      <Label x={31} y={54} size={6.5} tone="muted" anchor="middle">
        Plugins
      </Label>
      <rect
        x="52"
        y="44"
        width="28"
        height="15"
        rx="7.5"
        className="fill-transparent stroke-border"
        strokeWidth="1"
      />
      <Label x={66} y={54} size={6.5} tone="muted" anchor="middle">
        Apps
      </Label>
      <rect
        x="84"
        y="44"
        width="30"
        height="15"
        rx="7.5"
        className="fill-brand-lime"
      />
      <Label x={99} y={54} size={7} weight={700} tone="onLime" anchor="middle">
        MCPs
      </Label>
      <rect
        x="118"
        y="44"
        width="28"
        height="15"
        rx="7.5"
        className="fill-transparent stroke-border"
        strokeWidth="1"
      />
      <Label x={132} y={54} size={6.5} tone="muted" anchor="middle">
        Skills
      </Label>

      <Label x={14} y={78} size={8.5} weight={600}>
        Servers
      </Label>
      <rect
        x="136"
        y="68"
        width="58"
        height="15"
        rx="4"
        className="fill-background stroke-border"
        strokeWidth="1.1"
      />
      <Label x={165} y={78} size={7} anchor="middle">
        Add server
      </Label>

      {[88, 106].map((y) => (
        <g key={y}>
          <rect
            x="14"
            y={y}
            width="180"
            height="15"
            rx="4"
            className="fill-muted/60"
          />
          <Bar x={22} y={y + 6} width={52} />
        </g>
      ))}
    </Frame>
  );
}

/** Add server, with the custom option picked out of what it opens. */
export function ChatgptAddServer() {
  return (
    <Frame>
      <Label x={14} y={26} size={9} weight={600}>
        Servers
      </Label>

      <rect
        x="132"
        y="15"
        width="62"
        height="17"
        rx="5"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <Label x={163} y={26} size={7.5} anchor="middle">
        Add server
      </Label>

      <rect
        x="70"
        y="38"
        width="124"
        height="44"
        rx="6"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <rect
        x="74"
        y="42"
        width="116"
        height="17"
        rx="4"
        className="fill-brand-lime"
      />
      <Label x={81} y={54} size={7.5} tone="onLime" weight={700}>
        Connect to a custom MCP
      </Label>
      <Glyph x={81} y={64} size={6} />
      <Bar x={92} y={66} width={62} />

      {[92, 110].map((y) => (
        <g key={y}>
          <rect
            x="14"
            y={y}
            width="180"
            height="15"
            rx="4"
            className="fill-muted/60"
          />
          <Bar x={22} y={y + 6} width={48} />
        </g>
      ))}
    </Frame>
  );
}

/**
 * The custom MCP form. Streamable HTTP is the load-bearing detail: STDIO
 * is selected by default and hides the address field, which reads as a
 * broken form rather than as the wrong type being chosen.
 */
export function ChatgptCustomMcp() {
  return (
    <Frame>
      <Label x={14} y={19} size={9} weight={600}>
        Connect to a custom MCP
      </Label>

      <rect
        x="14"
        y="25"
        width="180"
        height="17"
        rx="5"
        className="fill-background stroke-border"
        strokeWidth="1.2"
      />
      <Label x={22} y={37} size={8} weight={400}>
        AI Catalyst
      </Label>

      {/* Type: two segments, the right one chosen. */}
      <Label x={14} y={57} size={7} tone="muted">
        Type
      </Label>
      <rect
        x="72"
        y="47"
        width="50"
        height="15"
        rx="4"
        className="fill-transparent stroke-border"
        strokeWidth="1"
      />
      <Label x={97} y={57} size={7} tone="faint" anchor="middle">
        STDIO
      </Label>
      <rect
        x="124"
        y="47"
        width="70"
        height="15"
        rx="4"
        className="fill-brand-lime"
      />
      <Label x={159} y={57} size={7} weight={700} tone="onLime" anchor="middle">
        Streamable HTTP
      </Label>

      <rect
        x="14"
        y="67"
        width="180"
        height="19"
        rx="5"
        className="fill-background stroke-brand-lime"
        strokeWidth="2"
      />
      {/* "Copied" points at the Copy button; avoid left/right directions. */}
      <Label x={22} y={80} size={8} weight={400}>
        Paste the copied address
      </Label>
      <rect
        x="134"
        y="71"
        width="1.6"
        height="11"
        className="fill-brand-lime"
      />

      {[91, 109].map((y, index) => (
        <g key={y}>
          <rect
            x="14"
            y={y}
            width="180"
            height="16"
            rx="5"
            className="fill-background/50 stroke-border"
            strokeWidth="1"
          />
          <Label x={22} y={y + 11} size={7} tone="faint" weight={400}>
            {index === 0 ? "Bearer token env var" : "Headers"}
          </Label>
        </g>
      ))}
    </Frame>
  );
}

/**
 * Our own /oauth/consent screen, not a ChatGPT one. It opens in a window
 * with no session of its own, which is why the step and the troubleshooting
 * both warn about being asked to sign in.
 */
export function ChatgptApprove() {
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
        ChatGPT wants to connect
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
