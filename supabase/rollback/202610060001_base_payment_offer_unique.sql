-- Removes only this migration's index; retains every payment and Change Order.
-- Coordinate with BASE confirmation writers: rollback removes duplicate protection.
begin;
set local lock_timeout = '5s';
drop index public.payments_base_offer_unique;
commit;
