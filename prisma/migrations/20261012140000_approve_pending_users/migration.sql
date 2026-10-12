-- Одобрение админом выключено: заявки, поданные до этого, получают доступ, как новые регистрации.
UPDATE "User" SET "status" = 'APPROVED' WHERE "status" = 'PENDING' AND "role" = 'USER';
