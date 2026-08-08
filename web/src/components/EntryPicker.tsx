"use client";

/**
 * 「新規ジョブ」の入口二択。
 * ターゲットが決まっている → 従来フォーム / ふわっとしている → 対話画面。
 */
export function EntryPicker({
  open,
  onClose,
  onPickForm,
  onPickChat,
}: {
  open: boolean;
  onClose: () => void;
  onPickForm: () => void;
  onPickChat: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="新規ジョブの作り方"
        style={{ maxWidth: 520 }}
      >
        <div className="modal-head">
          <h3>新規ジョブ</h3>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="picker">
            <button className="pick" onClick={onPickForm}>
              <div className="ph">ターゲットは決まっている</div>
              <div className="pd">
                業種・条件が言える。フォームに与件とレシピを入れてそのまま作成。
              </div>
            </button>
            <button className="pick" onClick={onPickChat}>
              <div className="ph">
                まだふわっとしている
                <span className="pill">対話</span>
              </div>
              <div className="pd">
                「誰に売るか」が未確定。AI と対話しながら観測可能なシグナルを見つける。
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
