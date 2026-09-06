// web/features/settings-global/ApiKeysSection.tsx — ports docs/prototype.jsx:632-654 as a
// static, disabled "coming soon" preview per devspec F13 (shipped disabled — scope cut, not a
// feature). No state, no API calls, no wiring: the inputs/buttons below are permanently
// disabled placeholders showing the intended shape of the panel.
import { Btn } from "@/shared/ui";
import { Field, inputStyle } from "./fields";
import { Section } from "./Section";

const PROVIDERS = ["Anthropic", "OpenAI-compatible"] as const;

export function ApiKeysSection() {
  return (
    <Section
      title="Your API keys"
      note="Coming soon. Provider credentials will be stored server-side, envelope-encrypted under a managed key service, never returned to the browser, never logged, and rotatable."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROVIDERS.map((prov) => (
          <div key={prov} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Field label={prov}>
              <input
                type="password"
                value=""
                disabled
                readOnly
                placeholder={prov === "Anthropic" ? "sk-ant-…" : "sk-…"}
                style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
              />
            </Field>
            <Btn small disabled>
              Save
            </Btn>
          </div>
        ))}
      </div>
    </Section>
  );
}
