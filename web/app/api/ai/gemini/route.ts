import { NextResponse } from "next/server"
import type { Skydiver } from "@/lib/types"
import type { ComputedAiVariant, StatisticalAnomalyFinding, TrendFinding } from "@/lib/ai-analysis-types"

export const runtime = "nodejs"

type GeminiRequest = {
  skydivers: Skydiver[]
  statistical: ComputedAiVariant
  trends: ComputedAiVariant
}

type GeminiFinding = {
  label: string
  severity: "critical" | "warning" | "info"
  detail: string
  confidence: number
}

type GeminiResponse = {
  provider: "gemini" | "fallback"
  model: string
  summary: string
  confidence: number
  recommendation: string
  findings: GeminiFinding[]
  alignment: string[]
  fallbackReason?: "missing_api_key" | "upstream_http_error" | "missing_text_part" | "json_parse_error" | "network_error"
  upstreamStatus?: number
}

function severityFromConfidence(confidence: number) {
  if (confidence >= 80) return "critical"
  if (confidence >= 55) return "warning"
  return "info"
}

function toCompactSkydiver(skydiver: Skydiver) {
  return {
    name: skydiver.name,
    status: skydiver.status,
    heartRate: skydiver.heartRate,
    oxygen: skydiver.oxygen,
    stress: skydiver.stress,
    temperature: skydiver.temperature,
    altitude: skydiver.altitude,
    verticalSpeed: skydiver.verticalSpeed,
    position: skydiver.position,
    riskScore: skydiver.riskScore,
    parachuteOpen: skydiver.parachuteOpen,
  }
}

function buildFallbackResponse(
  payload: GeminiRequest,
  reason: GeminiResponse["fallbackReason"],
  upstreamStatus?: number,
): GeminiResponse {
  const topStat = payload.statistical.findings[0] as StatisticalAnomalyFinding | undefined
  const topTrend = payload.trends.findings[0] as TrendFinding | undefined

  const alignment = [
    topStat ? `Statistical model flags ${topStat.skydiver} for ${topStat.label.toLowerCase()}.` : "Statistical model sees no major baseline deviation.",
    topTrend ? `Trend model flags ${topTrend.skydiver} for ${topTrend.label.toLowerCase()}.` : "Trend model sees no threshold-bound trajectory.",
  ]

  return {
    provider: "fallback",
    model: "local-computed-fallback",
    summary: topStat || topTrend
      ? "Local Gemini fallback mirrors the computed analysis until a live API key is configured."
      : "Local Gemini fallback sees no major disagreement with the computed analysis.",
    confidence: topStat || topTrend ? 72 : 88,
    recommendation: topTrend
      ? `Monitor ${topTrend.skydiver} closely and prepare intervention if the trend continues.`
      : "Continue live monitoring; current telemetry is stable.",
    findings: [
      topStat
        ? {
            label: topStat.label,
            severity: severityFromConfidence(Math.min(95, Math.round(Math.abs(topStat.zScore) * 28))),
            detail: topStat.detail,
            confidence: Math.min(95, Math.round(Math.abs(topStat.zScore) * 28)),
          }
        : {
            label: "Statistical baseline match",
            severity: "info",
            detail: "No strong personal-baseline outliers in the current session.",
            confidence: 91,
          },
      topTrend
        ? {
            label: topTrend.label,
            severity: severityFromConfidence(topTrend.projectedMinutes ? Math.max(50, 100 - topTrend.projectedMinutes * 4) : 58),
            detail: topTrend.detail,
            confidence: topTrend.projectedMinutes ? Math.max(50, 100 - Math.round(topTrend.projectedMinutes * 4)) : 58,
          }
        : {
            label: "Trend stability",
            severity: "info",
            detail: "No strong linear drift toward critical thresholds.",
            confidence: 89,
          },
    ],
    alignment,
    fallbackReason: reason,
    upstreamStatus,
  }
}

function extractJson(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  return trimmed
}

function isRetriableStatus(status: number) {
  return status === 429 || status === 500 || status === 503
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  let payload: GeminiRequest

  try {
    payload = (await request.json()) as GeminiRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  if (!Array.isArray(payload.skydivers) || !payload.statistical || !payload.trends) {
    return NextResponse.json({ error: "Missing analysis payload." }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(buildFallbackResponse(payload, "missing_api_key"))
  }

  const configuredModel = process.env.GEMINI_MODEL?.trim()
  const modelCandidates = [
    ...(configuredModel ? [configuredModel] : []),
    "gemini-2.0-flash-lite",   // 30 RPM / 1500 RPD on free tier — most generous
    "gemini-1.5-flash",        // 15 RPM / 1500 RPD — stable free tier
    "gemini-2.0-flash",        // 15 RPM / 1500 RPD
    "gemini-2.5-flash",        // preview — low free limits, last resort
  ]
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are reviewing skydiver telemetry.",
              "Return strict JSON with keys: summary, confidence, recommendation, findings, alignment.",
              "findings must be an array of { label, severity, detail, confidence }.",
              "alignment must be an array of short strings describing where you agree or disagree with the computed analysis.",
              "Focus on whether the statistical anomaly view and the trend view point to the same risk.",
              "Keep the response concise and operational.",
              "Session payload:",
              JSON.stringify(
                {
                  skydivers: payload.skydivers.map(toCompactSkydiver),
                  statistical: payload.statistical,
                  trends: payload.trends,
                },
                null,
                2,
              ),
            ].join("\n\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  }

  try {
    let lastStatus: number | undefined
    const maxAttemptsPerModel = 3
    const baseDelayMs = 300

    for (const model of modelCandidates) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

      for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt += 1) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          lastStatus = response.status

          // 404 = model not found — skip to next candidate.
          if (response.status === 404) break

          // 403 = invalid API key — no model will succeed, bail out.
          if (response.status === 403) {
            return NextResponse.json(buildFallbackResponse(payload, "upstream_http_error", response.status), { status: 200 })
          }

          // 429 / 500 / 503 — retry with backoff, then move to next model.
          if (isRetriableStatus(response.status)) {
            if (attempt < maxAttemptsPerModel) {
              const retryAfter = response.headers.get("retry-after")
              const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN
              const backoffMs = Number.isFinite(retryAfterMs)
                ? retryAfterMs
                : baseDelayMs * Math.pow(2, attempt - 1)
              await sleep(backoffMs)
              continue
            }
            // Retries exhausted for this model — try the next candidate.
            break
          }

          return NextResponse.json(buildFallbackResponse(payload, "upstream_http_error", response.status), { status: 200 })
        }

        const json = await response.json()
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text

        if (typeof rawText !== "string") {
          return NextResponse.json(buildFallbackResponse(payload, "missing_text_part"), { status: 200 })
        }

        let parsed: Partial<GeminiResponse>
        try {
          parsed = JSON.parse(extractJson(rawText)) as Partial<GeminiResponse>
        } catch {
          return NextResponse.json(buildFallbackResponse(payload, "json_parse_error"), { status: 200 })
        }

        return NextResponse.json({
          provider: "gemini",
          model,
          summary: typeof parsed.summary === "string" ? parsed.summary : "Gemini returned an unreadable summary.",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
          recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "Review the telemetry manually.",
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
          alignment: Array.isArray(parsed.alignment) ? parsed.alignment : [],
        })
      }
    }

    return NextResponse.json(buildFallbackResponse(payload, "upstream_http_error", lastStatus), { status: 200 })
  } catch {
    return NextResponse.json(buildFallbackResponse(payload, "network_error"), { status: 200 })
  }
}