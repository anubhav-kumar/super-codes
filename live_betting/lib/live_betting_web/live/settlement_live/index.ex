defmodule LiveBettingWeb.SettlementLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Settlements
        <:actions>
          <.button variant="primary" navigate={~p"/settlements/new"}>
            <.icon name="hero-plus" /> New Settlement
          </.button>
        </:actions>
      </.header>

      <.table
        id="settlements"
        rows={@streams.settlements}
        row_click={fn {_id, settlement} -> JS.navigate(~p"/settlements/#{settlement}") end}
      >
        <:col :let={{_id, settlement}} label="Total pool">{settlement.total_pool}</:col>
        <:col :let={{_id, settlement}} label="House cut">{settlement.house_cut}</:col>
        <:col :let={{_id, settlement}} label="Distributable pool">{settlement.distributable_pool}</:col>
        <:col :let={{_id, settlement}} label="Outcome">{settlement.outcome}</:col>
        <:col :let={{_id, settlement}} label="Settled at">{settlement.settled_at}</:col>
        <:action :let={{_id, settlement}}>
          <div class="sr-only">
            <.link navigate={~p"/settlements/#{settlement}"}>Show</.link>
          </div>
          <.link navigate={~p"/settlements/#{settlement}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, settlement}}>
          <.link
            phx-click={JS.push("delete", value: %{id: settlement.id}) |> hide("##{id}")}
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
     |> assign(:page_title, "Listing Settlements")
     |> stream(:settlements, list_settlements())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    settlement = Betting.get_settlement!(id)
    {:ok, _} = Betting.delete_settlement(settlement)

    {:noreply, stream_delete(socket, :settlements, settlement)}
  end

  defp list_settlements() do
    Betting.list_settlements()
  end
end
