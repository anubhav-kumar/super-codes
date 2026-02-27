defmodule LiveBettingWeb.PayoutLive.Show do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Payout {@payout.id}
        <:subtitle>This is a payout record from your database.</:subtitle>
        <:actions>
          <.button navigate={~p"/payouts"}>
            <.icon name="hero-arrow-left" />
          </.button>
          <.button variant="primary" navigate={~p"/payouts/#{@payout}/edit?return_to=show"}>
            <.icon name="hero-pencil-square" /> Edit payout
          </.button>
        </:actions>
      </.header>

      <.list>
        <:item title="Weight share pct">{@payout.weight_share_pct}</:item>
        <:item title="Gross payout">{@payout.gross_payout}</:item>
        <:item title="Status">{@payout.status}</:item>
        <:item title="Paid at">{@payout.paid_at}</:item>
      </.list>
    </Layouts.app>
    """
  end

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Show Payout")
     |> assign(:payout, Betting.get_payout!(id))}
  end
end
