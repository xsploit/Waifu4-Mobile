import type { EmotionTelemetryEvent, VrmTelemetrySnapshot } from '../../../lib/menu/types';

type EmotionTelemetryTabProps = {
  emotionTelemetryEvents: EmotionTelemetryEvent[];
  vrmTelemetry: VrmTelemetrySnapshot | null;
};

function formatTelemetryTop(values: string[], fallback: string) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = value.trim() || fallback;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
  return {
    text: top.length ? top.map(([name, count]) => `${name} ${count}`).join(' / ') : fallback,
    unique: counts.size,
  };
}

function formatWeight(value: number) {
  return value.toFixed(2);
}

function formatWeightList(weights: VrmTelemetrySnapshot['expressionWeights']) {
  return weights.length
    ? weights.map((entry) => `${entry.name} ${formatWeight(entry.value)}`).join(' / ')
    : 'none';
}

export function EmotionTelemetryTab({
  emotionTelemetryEvents,
  vrmTelemetry,
}: EmotionTelemetryTabProps) {
  const recentTelemetryEvents = emotionTelemetryEvents.slice(0, 20);
  const telemetryEmotionSummary = formatTelemetryTop(
    recentTelemetryEvents.map((event) => event.emotion),
    'none',
  );
  const telemetryExpressionSummary = formatTelemetryTop(
    recentTelemetryEvents.map((event) =>
      event.resolvedExpressionNames.length ? event.resolvedExpressionNames.join('+') : 'none',
    ),
    'none',
  );
  const telemetryAnimationSummary = formatTelemetryTop(
    recentTelemetryEvents.map((event) => event.animationName ?? 'none'),
    'none',
  );
  const latestTelemetryEvent = recentTelemetryEvents[0];

  return (
    <section className="anim-group emotion-telemetry">
      <div className="anim-group-header">
        <div>
          <div className="anim-group-title">
            Emotion Telemetry
            <span>{emotionTelemetryEvents.length}/20</span>
          </div>
          <p>Shows model emotion, expression resolution, and reaction playback.</p>
        </div>
      </div>
      <div className="anim-group-list">
        <div className="emotion-telemetry-summary">
          <div>
            <span>Mouth</span>
            <strong>{vrmTelemetry?.activeMouthExpression ?? 'none'}</strong>
            <em>
              aa {formatWeight(vrmTelemetry?.mouthWeights.aa ?? 0)} / ih{' '}
              {formatWeight(vrmTelemetry?.mouthWeights.ih ?? 0)} / ou{' '}
              {formatWeight(vrmTelemetry?.mouthWeights.ou ?? 0)} / ee{' '}
              {formatWeight(vrmTelemetry?.mouthWeights.ee ?? 0)} / oh{' '}
              {formatWeight(vrmTelemetry?.mouthWeights.oh ?? 0)}
            </em>
          </div>
          <div>
            <span>Final Expressions</span>
            <strong>{formatWeightList(vrmTelemetry?.expressionWeights ?? [])}</strong>
            <em>{vrmTelemetry?.activeExpressionCount ?? 0} active</em>
          </div>
          <div>
            <span>Snapshot</span>
            <strong>
              {vrmTelemetry ? new Date(vrmTelemetry.updatedAt).toLocaleTimeString() : 'no VRM'}
            </strong>
            <em>throttled live weights</em>
          </div>
        </div>
        {emotionTelemetryEvents.length === 0 ? (
          <div className="row anim-row disabled">
            <span className="name">No emotion metadata played yet.</span>
          </div>
        ) : (
          <>
            <div className="emotion-telemetry-summary">
              <div>
                <span>Emotions</span>
                <strong>{telemetryEmotionSummary.text}</strong>
                <em>{telemetryEmotionSummary.unique} unique</em>
              </div>
              <div>
                <span>Expressions</span>
                <strong>{telemetryExpressionSummary.text}</strong>
                <em>{telemetryExpressionSummary.unique} unique</em>
              </div>
              <div>
                <span>Animations</span>
                <strong>{telemetryAnimationSummary.text}</strong>
                <em>{telemetryAnimationSummary.unique} unique</em>
              </div>
            </div>
            {latestTelemetryEvent ? (
              <div className="emotion-telemetry-summary">
                <div>
                  <span>Model VAD</span>
                  <strong>
                    V {formatWeight(latestTelemetryEvent.metadataValence)} / A{' '}
                    {formatWeight(latestTelemetryEvent.metadataArousal)} / D{' '}
                    {formatWeight(latestTelemetryEvent.metadataDominance)}
                  </strong>
                  <em>raw reply metadata</em>
                </div>
                <div>
                  <span>Affect VAD</span>
                  <strong>
                    V {formatWeight(latestTelemetryEvent.affectValence)} / A{' '}
                    {formatWeight(latestTelemetryEvent.affectArousal)} / D{' '}
                    {formatWeight(latestTelemetryEvent.affectDominance)}
                  </strong>
                  <em>{latestTelemetryEvent.affectLabel}</em>
                </div>
                <div>
                  <span>Requested Face</span>
                  <strong>{latestTelemetryEvent.requestedExpression}</strong>
                  <em>peak {formatWeight(latestTelemetryEvent.requestedIntensity)}</em>
                </div>
              </div>
            ) : null}
            {recentTelemetryEvents.map((event) => (
              <div className="row anim-row" key={event.id}>
                <div className="anim-row-main">
                  <span className="name">
                    {event.emotion}
                    <span className="badge badge-muted">
                      {new Date(event.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="anim-tags">
                      face {event.requestedExpression} -{' '}
                      {event.resolvedExpressionNames.length
                        ? event.resolvedExpressionNames.join(' / ')
                        : 'none'}
                    </span>
                    <span className="anim-tags">
                      model V {event.metadataValence.toFixed(2)} / A{' '}
                      {event.metadataArousal.toFixed(2)} / D {event.metadataDominance.toFixed(2)}
                    </span>
                    <span className="anim-tags">
                      affect {event.affectLabel} V {event.affectValence.toFixed(2)} / A{' '}
                      {event.affectArousal.toFixed(2)} / D {event.affectDominance.toFixed(2)}
                    </span>
                  </span>
                </div>
                <div className="anim-meta">
                  <div className="anim-meta-field">
                    <span>Expression</span>
                    <strong>
                      {event.expressionAccepted === null
                        ? 'pending'
                        : event.expressionAccepted
                          ? 'applied'
                          : 'skipped'}
                    </strong>
                    <span>{event.expressionReason}</span>
                  </div>
                  <div className="anim-meta-field">
                    <span>Peak</span>
                    <strong>{event.appliedIntensity.toFixed(2)}</strong>
                    <span>requested {event.requestedIntensity.toFixed(2)}</span>
                  </div>
                  <div className="anim-meta-field anim-meta-field-wide">
                    <span>Animation</span>
                    <strong>{event.animationName ?? 'none'}</strong>
                    <span>
                      {event.animationAccepted === null
                        ? event.animationReason
                        : event.animationAccepted
                          ? 'requested'
                          : event.animationReason}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
