defmodule LiveBettingWeb.Router do
  use LiveBettingWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {LiveBettingWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", LiveBettingWeb do
    pipe_through :browser

    get "/", PageController, :home
    live "/users", UserLive.Index, :index
  live "/users/new", UserLive.Index, :new
  live "/users/:id/edit", UserLive.Index, :edit
  live "/users/:id", UserLive.Show, :show
  live "/users/:id/show/edit", UserLive.Show, :edit

  live "/matches", MatchLive.Index, :index
  live "/matches/new", MatchLive.Index, :new
  live "/matches/:id/edit", MatchLive.Index, :edit
  live "/matches/:id", MatchLive.Show, :show
  live "/matches/:id/show/edit", MatchLive.Show, :edit

  live "/windows", WindowLive.Index, :index
  live "/windows/new", WindowLive.Index, :new
  live "/windows/:id/edit", WindowLive.Index, :edit
  live "/windows/:id", WindowLive.Show, :show
  live "/windows/:id/show/edit", WindowLive.Show, :edit

  live "/pools", PoolLive.Index, :index
  live "/pools/new", PoolLive.Index, :new
  live "/pools/:id/edit", PoolLive.Index, :edit
  live "/pools/:id", PoolLive.Show, :show
  live "/pools/:id/show/edit", PoolLive.Show, :edit

  live "/bets", BetLive.Index, :index
  live "/bets/new", BetLive.Index, :new
  live "/bets/:id/edit", BetLive.Index, :edit
  live "/bets/:id", BetLive.Show, :show
  live "/bets/:id/show/edit", BetLive.Show, :edit

  live "/settlements", SettlementLive.Index, :index
  live "/settlements/new", SettlementLive.Index, :new
  live "/settlements/:id/edit", SettlementLive.Index, :edit
  live "/settlements/:id", SettlementLive.Show, :show
  live "/settlements/:id/show/edit", SettlementLive.Show, :edit

  live "/payouts", PayoutLive.Index, :index
  live "/payouts/new", PayoutLive.Index, :new
  live "/payouts/:id/edit", PayoutLive.Index, :edit
  live "/payouts/:id", PayoutLive.Show, :show
  live "/payouts/:id/show/edit", PayoutLive.Show, :edit

  live "/wallet_transactions", WalletTransactionLive.Index, :index
  live "/wallet_transactions/new", WalletTransactionLive.Index, :new
  live "/wallet_transactions/:id/edit", WalletTransactionLive.Index, :edit
  live "/wallet_transactions/:id", WalletTransactionLive.Show, :show
  live "/wallet_transactions/:id/show/edit", WalletTransactionLive.Show, :edit
  end

  # Other scopes may use custom stacks.
  # scope "/api", LiveBettingWeb do
  #   pipe_through :api
  # end

  # Enable LiveDashboard and Swoosh mailbox preview in development
  if Application.compile_env(:live_betting, :dev_routes) do
    # If you want to use the LiveDashboard in production, you should put
    # it behind authentication and allow only admins to access it.
    # If your application does not have an admins-only section yet,
    # you can use Plug.BasicAuth to set up some basic authentication
    # as long as you are also using SSL (which you should anyway).
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: LiveBettingWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end
