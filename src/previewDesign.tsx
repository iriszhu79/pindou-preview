import { useId, type ReactNode } from "react";
import { adjacentStep, type Project } from "./model";
export function PixelWorld({ compact = false }: { compact?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`pixel-world${compact ? " compact" : ""}`}
      viewBox={compact ? "0 0 900 120" : "0 0 900 360"}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <g id={`${id}-flower`}>
          <path d="M8 14V30H12V14" fill="#407e40" />
          <path d="M0 18H8V24H0M12 14H20V20H12" fill="#75b94c" />
          <path d="M4 0H14V4H18V12H14V16H4V12H0V4H4Z" fill="#292638" />
          <path d="M5 2H13V5H16V11H12V14H5V11H2V5H5Z" fill="#f2a2b9" />
          <rect x="7" y="6" width="5" height="5" fill="#f8d467" />
        </g>
        <g id={`${id}-cloud`} fill="#fffbee">
          <path d="M0 16H16V6H32V0H56V10H72V18H88V30H0Z" />
          <path d="M12 30H88V36H12" fill="#c8eff4" />
        </g>
      </defs>
      <rect width="900" height="360" fill="#65cef0" />
      <use href={`#${id}-cloud`} x="54" y="38" />
      <use href={`#${id}-cloud`} x="714" y="12" />
      <use href={`#${id}-cloud`} x="354" y="105" />
      <path
        d="M0 259H48V228H83V247H120V218H170V254H216V230H252V262H305V237H360V250H399V223H450V251H499V235H552V252H600V218H651V244H710V229H770V250H820V222H900V360H0Z"
        fill="#94d8ae"
      />
      <path
        d="M0 289H80V268H130V279H190V255H239V283H309V262H373V287H451V263H510V281H570V253H624V278H680V264H728V283H800V257H900V360H0Z"
        fill="#62ad72"
      />
      {/* An original workshop and tree, assembled from individual pixel shapes. */}
      <path d="M738 175H870V321H738Z" fill="#292638" />
      <path d="M746 183H862V313H746Z" fill="#fff1c9" />
      <path d="M728 166H880V183H728Z" fill="#292638" />
      <path d="M734 156H874V171H734Z" fill="#f8d467" />
      <path d="M746 203H862V225H746Z" fill="#e66b66" />
      <path
        d="M758 203H774V225H758M790 203H806V225H790M822 203H838V225H822"
        fill="#fff9f0"
      />
      <path d="M772 245H820V287H772Z" fill="#292638" />
      <path d="M778 251H814V281H778Z" fill="#8ee0f7" />
      <path d="M778 278L810 251H814V259L788 281H778" fill="#e6f7ee" />
      <path d="M83 170H109V321H83Z" fill="#292638" />
      <path d="M89 175H102V321H89Z" fill="#af794c" />
      <path d="M87 238H108V251H87" fill="#885c3e" />
      <path
        d="M34 115H57V91H89V77H124V94H148V124H160V163H146V186H118V200H74V187H44V164H29V131H34Z"
        fill="#292638"
      />
      <path
        d="M40 119H63V98H91V84H118V102H140V129H153V157H139V179H114V192H79V180H51V159H36V135H40Z"
        fill="#73b64b"
      />
      <path
        d="M58 118H88V97H112V117H133V137H108V147H76V137H51V127H58Z"
        fill="#a9d967"
      />
      <rect x="62" y="152" width="13" height="12" fill="#c9e688" />
      <path
        d="M193 288H316V300H193M204 302H212V326H204M296 302H304V326H296"
        fill="#292638"
      />
      <path d="M200 278H309V289H200Z" fill="#f8ce72" />
      {/* Tiny bead keeper: original craft creature, not a game character. */}
      <path
        d="M477 254H493V242H529V254H541V298H529V310H489V301H477Z"
        fill="#292638"
      />
      <path
        d="M484 260H499V250H523V260H534V294H522V303H495V296H484Z"
        fill="#fff9de"
      />
      <path d="M485 249V240H497V232H524V240H536V249Z" fill="#292638" />
      <path d="M492 241H501V237H521V244H530V249H492Z" fill="#9ac773" />
      <rect x="493" y="265" width="5" height="7" fill="#292638" />
      <rect x="517" y="265" width="5" height="7" fill="#292638" />
      <path d="M504 278H515V283H504Z" fill="#e391a5" />
      <path d="M463 283H505V313H463Z" fill="#292638" />
      <rect x="468" y="288" width="32" height="20" fill="#fff9f0" />
      <path
        d="M480 290H489V294H493V301H488V305H480V301H476V294H480Z"
        fill="#efa4b7"
      />
      <rect x="483" y="296" width="4" height="4" fill="#f6c768" />
      <path
        d="M568 279H583V270H594V278H610V270H620V286H626V306H616V315H576V306H568Z"
        fill="#292638"
      />
      <path
        d="M574 285H585V277H589V285H614V277H616V289H620V302H612V309H580V302H574Z"
        fill="#f6c768"
      />
      <rect x="582" y="290" width="4" height="4" fill="#292638" />
      <rect x="607" y="290" width="4" height="4" fill="#292638" />
      <path d="M591 298H603V303H591" fill="#fff9f0" />
      <use href={`#${id}-flower`} x="160" y="294" />
      <use href={`#${id}-flower`} x="344" y="291" />
      <use href={`#${id}-flower`} x="660" y="287" />
      <use href={`#${id}-flower`} x="688" y="299" />
      <use href={`#${id}-flower`} x="28" y="294" />
      <path d="M0 321H900V333H0Z" fill="#292638" />
      <path d="M0 321H900V328H0Z" fill="#8ec44e" />
      <path d="M0 333H900V360H0Z" fill="#ad7448" />
      <path d="M0 333H900V340H0Z" fill="#d49755" />
      <path
        d="M15 343H40V352H15M89 349H113V360H89M152 340H170V350H152M225 346H250V357H225M325 342H351V351H325M425 349H450V360H425M532 341H554V351H532M635 347H661V358H635M747 341H770V351H747M843 348H868V359H843"
        fill="#83533f"
      />
    </svg>
  );
}
export function GamePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="game-panel">
      <h3 className="game-panel-title">✦ {title} ✦</h3>
      {children}
    </section>
  );
}
export function GameStart({
  projects,
  choosing,
  onStart,
  onUpload,
  onSample,
  onProject,
}: {
  projects: Project[];
  choosing: boolean;
  onStart: () => void;
  onUpload: () => void;
  onSample: () => void;
  onProject: (p: Project) => void;
}) {
  return (
    <section className="game-start console-red">
      <div className="console-screws" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="start-screen">
        <PixelWorld />
        <div className="start-content">
          <span className="preview-pill">V1.5 DESIGN PREVIEW</span>
          <h1>
            PINDOU
            <span className="logo-flower" aria-hidden="true">
              ✿
            </span>
          </h1>
          <p className="logo-subtitle">✦ PIXEL BEADING STUDIO ✦</p>
          {choosing && projects.length ? (
            <div className="start-project-picker">
              <h2>Continue your adventure</h2>
              {projects.map((p) => (
                <button
                  className="pixel-start-button"
                  key={p.id}
                  onClick={() => onProject(p)}
                >
                  ▶ Continue {p.name}
                </button>
              ))}
              <button className="prepare-button" onClick={onSample}>
                Pattern overview →
              </button>
            </div>
          ) : (
            <div className="start-actions">
              <button className="pixel-start-button" onClick={onStart}>
                <span aria-hidden="true">▶</span> START
              </button>
              <button
                className="pixel-start-button upload-action"
                onClick={onUpload}
              >
                <span aria-hidden="true">↑</span> UPLOAD
              </button>
              <small>Upload previews only · sample is interactive</small>
            </div>
          )}
        </div>
      </div>
      <div className="console-chin">
        <span className="console-speaker" aria-hidden="true" />
        <details className="start-help">
          <summary>How to play</summary>
          <p>
            START opens your preview projects or the synthetic sample. UPLOAD
            previews an image; automatic recognition is not available. Your V1.4
            saves are never read or modified here.
          </p>
        </details>
        <span>MAKE LITTLE THINGS.</span>
      </div>
    </section>
  );
}
export function ConsolePad({
  p,
  showEmpty,
  onNavigate,
}: {
  p: Project;
  showEmpty: boolean;
  onNavigate: (p: Project) => void;
}) {
  const prev = adjacentStep(p, -1, showEmpty),
    next = adjacentStep(p, 1, showEmpty);
  const action = (direction: "up" | "down" | "left" | "right") => {
    if (p.strategy === "row" && (direction === "up" || direction === "down"))
      return direction === (p.reverse ? "down" : "up") ? prev : next;
    if (
      p.strategy === "column" &&
      (direction === "left" || direction === "right")
    )
      return direction === (p.reverse ? "right" : "left") ? prev : next;
    return null;
  };
  return (
    <div
      className="console-dpad"
      role="group"
      aria-label="D-pad step navigation"
    >
      {(["up", "left", "right", "down"] as const).map((d) => {
        const target = action(d);
        return (
          <button
            className={`pad-${d}`}
            key={d}
            aria-label={`D-pad ${d}`}
            disabled={!target}
            onClick={() => target && onNavigate(target)}
          >
            {{ up: "↑", down: "↓", left: "←", right: "→" }[d]}
          </button>
        );
      })}
      <span aria-hidden="true" />
    </div>
  );
}
