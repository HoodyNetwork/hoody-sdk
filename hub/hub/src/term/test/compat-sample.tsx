// A sample of raw HTML in shared code, used by the compat runtime tests.
export function CompatSample({ name, onGo }: { name: string; onGo?: () => void }) {
  return (
    <div className="wrap">
      <h2>Title</h2>
      <p>
        Hello <b>{name}</b>, you have {3} items.
      </p>
      <ul>
        <li>one</li>
        <li>
          <span>two</span> <em>second</em>
        </li>
      </ul>
      <div>
        <button onClick={onGo}>Go</button>
        <svg />
      </div>
    </div>
  );
}
