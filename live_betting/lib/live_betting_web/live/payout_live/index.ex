defmodule LiveBettingWeb.PayoutLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Payouts
        <:actions>
          <.button variant="primary" navigate={~p"/payouts/new"}>
            <.icon name="hero-plus" /> New Payout
          </.button>
        </:actions>
      </.header>

      <.table
        id="payouts"
        rows={@streams.payouts}
        row_click={fn {_id, payout} -> JS.navigate(~p"/payouts/#{payout}") end}
      >
        <:col :let={{_id, payout}} label="Weight share pct">{payout.weight_share_pct}</:col>
        <:col :let={{_id, payout}} label="Gross payout">{payout.gross_payout}</:col>
        <:col :let={{_id, payout}} label="Status">{payout.status}</:col>
        <:col :let={{_id, payout}} label="Paid at">{payout.paid_at}</:col>
        <:action :let={{_id, payout}}>
          <div class="sr-only">
            <.link navigate={~p"/payouts/#{payout}"}>Show</.link>
          </div>
          <.link navigate={~p"/payouts/#{payout}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, payout}}>
          <.link
            phx-click={JS.push("delete", value: %{id: payout.id}) |> hide("##{id}")}
            data-confirm="Are you sure?"
          >
            Delete
          </.link>
        </:action>
      </.table>
    </Layouts.app>
    """
  end

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:page_title, "Listing Payouts")
     |> stream(:payouts, list_payouts())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    payout = Betting.get_payout!(id)
    {:ok, _} = Betting.delete_payout(payout)

    {:noreply, stream_delete(socket, :payouts, payout)}
  end

  defp list_payouts() do
    Betting.list_payouts()
  end
end
