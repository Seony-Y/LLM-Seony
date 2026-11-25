-- 대화는 자주 바뀌고 지우면 남지 않아야 하므로 이력을 두지 않는다.
DROP TRIGGER records_keep_history;

CREATE TRIGGER records_keep_history BEFORE UPDATE ON records
WHEN old.kind <> 'talk'
BEGIN
  INSERT INTO record_history (id, data, updated_at, deleted_at)
  VALUES (old.id, old.data, old.updated_at, old.deleted_at);
END;
