defmodule LiveBetting.Repo do
  use Ecto.Repo,
    otp_app: :live_betting,
    adapter: Ecto.Adapters.Postgres
end
