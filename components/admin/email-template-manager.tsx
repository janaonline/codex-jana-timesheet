"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/common/input";
import { Textarea } from "@/components/common/textarea";
import {
  buildEmailTemplatePreview,
  EMAIL_TEMPLATE_DEFINITIONS,
  type EmailTemplateContent,
  type EmailTemplateKey,
} from "@/emails/templates";

type TemplateMap = Record<EmailTemplateKey, EmailTemplateContent>;

const templateKeys = Object.keys(EMAIL_TEMPLATE_DEFINITIONS) as EmailTemplateKey[];

export function EmailTemplateManager({
  templates,
}: {
  templates: TemplateMap;
}) {
  const [selectedKey, setSelectedKey] = useState<EmailTemplateKey>(templateKeys[0]);
  const [draftTemplates, setDraftTemplates] = useState<TemplateMap>(templates);
  const selectedTemplate = draftTemplates[selectedKey];
  const definition = EMAIL_TEMPLATE_DEFINITIONS[selectedKey];
  const preview = useMemo(
    () => buildEmailTemplatePreview(selectedKey, draftTemplates),
    [draftTemplates, selectedKey],
  );

  function updateSelectedTemplate(field: keyof EmailTemplateContent, value: string) {
    setDraftTemplates((current) => ({
      ...current,
      [selectedKey]: {
        ...current[selectedKey],
        [field]: value,
      },
    }));
  }

  return (
    <div className="space-y-5">
      <input
        type="hidden"
        name="emailTemplates"
        value={JSON.stringify(draftTemplates)}
        readOnly
      />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          {templateKeys.map((key) => (
            <button
              key={key}
              type="button"
              className={`w-full rounded-3xl border px-4 py-3 text-left transition ${
                selectedKey === key
                  ? "border-amber-300 bg-amber-50"
                  : "border-stone-200 bg-white hover:bg-stone-50"
              }`}
              onClick={() => setSelectedKey(key)}
            >
              <p className="text-sm font-semibold text-stone-950">
                {EMAIL_TEMPLATE_DEFINITIONS[key].label}
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {EMAIL_TEMPLATE_DEFINITIONS[key].description}
              </p>
            </button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-4 rounded-[28px] border border-stone-200 bg-stone-50 p-4 sm:p-5">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-stone-950">{definition.label}</h3>
              <p className="text-sm leading-6 text-stone-600">{definition.description}</p>
            </div>

            <label className="block text-sm font-medium text-stone-700">
              Subject
              <Input
                className="mt-2 bg-white"
                value={selectedTemplate.subject}
                onChange={(event) =>
                  updateSelectedTemplate("subject", event.target.value)
                }
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              HTML body
              <Textarea
                className="mt-2 min-h-64 bg-white font-mono text-xs"
                value={selectedTemplate.html}
                onChange={(event) => updateSelectedTemplate("html", event.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-stone-700">
              Plain-text fallback
              <Textarea
                className="mt-2 min-h-32 bg-white font-mono text-xs"
                value={selectedTemplate.text}
                onChange={(event) => updateSelectedTemplate("text", event.target.value)}
              />
            </label>

            <div className="rounded-3xl border border-stone-200 bg-white px-4 py-4 text-sm text-stone-600">
              <p className="font-semibold text-stone-900">Sample tokens used in preview</p>
              <div className="mt-3 grid gap-2">
                {Object.entries(definition.sampleTokens).map(([token, value]) => (
                  <div
                    key={token}
                    className="flex flex-col gap-1 rounded-2xl border border-stone-200 px-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <code className="text-xs font-semibold text-stone-700">{`{{${token}}}`}</code>
                    <span className="text-xs leading-5 text-stone-500 sm:max-w-[65%] sm:text-right">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[28px] border border-stone-200 bg-white p-4 sm:p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Preview
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-950">
                {preview.subject}
              </h3>
            </div>
            <iframe
              className="h-[360px] w-full rounded-3xl border border-stone-200 bg-white"
              sandbox=""
              srcDoc={preview.html}
              title={`${definition.label} preview`}
            />
            <div className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-4">
              <p className="text-sm font-semibold text-stone-900">Plain-text preview</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                {preview.text}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
