import { useMemo } from 'react';
import type { JSX } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../../module_bindings';
import type * as Types from '../../module_bindings/types';
import { AddToQueueForm } from './AddToQueueForm';

interface QueueItemRowProps {
  item: Types.QueueItem;
  isOwn: boolean;
  onRemove: (id: bigint) => void;
}

function QueueItemRow({ item, isOwn, onRemove }: QueueItemRowProps): JSX.Element {
  return (
    <div className="queue-item">
      <span className="queue-item-position">#{item.position}</span>
      <img
        src={item.thumbnailUrl}
        alt={item.title}
        className="queue-item-thumb"
      />
      <div className="queue-item-meta">
        <p className="queue-item-title">{item.title}</p>
        <p className="queue-item-by">
          {isOwn ? 'you' : item.addedBy.toHexString().substring(0, 8)}
        </p>
      </div>
      {isOwn && (
        <button
          className="queue-item-remove"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.title} from queue`}
          title="Remove from queue"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function QueuePanel(): JSX.Element {
  const [queueItems] = useTable(tables.queue_item);
  const { identity } = useSpacetimeDB();
  const removeFromQueue = useReducer(reducers.removeFromQueue);

  const sorted = useMemo(
    () => [...queueItems].sort((a, b) => a.position - b.position),
    [queueItems]
  );

  const myPosition = useMemo(
    () =>
      identity
        ? sorted.find(item => item.addedBy.isEqual(identity))?.position ?? null
        : null,
    [identity, sorted]
  );

  const handleRemove = (queueItemId: bigint): void => {
    removeFromQueue({ queueItemId });
  };

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <h2 className="queue-title">Up Next</h2>
        {myPosition !== null && (
          <span className="queue-my-position">You&apos;re #{myPosition} in queue</span>
        )}
      </div>

      <div className="queue-list">
        {sorted.length === 0 ? (
          <p className="queue-empty">Queue is empty — add a song below!</p>
        ) : (
          sorted.map(item => (
            <QueueItemRow
              key={item.id.toString()}
              item={item}
              isOwn={!!identity && item.addedBy.isEqual(identity)}
              onRemove={handleRemove}
            />
          ))
        )}
      </div>

      <AddToQueueForm />
    </div>
  );
}
