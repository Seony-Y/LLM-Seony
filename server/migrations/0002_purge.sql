-- 휴지통을 비운 기록은 내용과 이력을 남기지 않는다. 빈 행은 다른 기기에 알리기 위해 둔다.
CREATE TRIGGER records_purge_history AFTER UPDATE ON records
WHEN json_extract(new.data, '$.purged') = 1
BEGIN
  DELETE FROM record_history WHERE id = new.id;
END;
