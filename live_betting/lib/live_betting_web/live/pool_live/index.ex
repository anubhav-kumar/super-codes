defmodule LiveBettingWeb.PoolLive.Index do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Matches

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Listing Pools
        <:actions>
          <.button variant="primary" navigate={~p"/pools/new"}>
            <.icon name="hero-plus" /> New Pool
          </.button>
        </:actions>
      </.header>

      <.table
        id="pools"
        rows={@streams.pools}
        row_click={fn {_id, pool} -> JS.navigate(~p"/pools/#{pool}") end}
      >
        <:col :let={{_id, pool}} label="Team">{pool.team}</:col>
        <:col :let={{_id, pool}} label="Total amount">{pool.total_amount}</:col>
        <:col :let={{_id, pool}} label="Total weight">{pool.total_weight}</:col>
        <:action :let={{_id, pool}}>
          <div class="sr-only">
            <.link navigate={~p"/pools/#{pool}"}>Show</.link>
          </div>
          <.link navigate={~p"/pools/#{pool}/edit"}>Edit</.link>
        </:action>
        <:action :let={{id, pool}}>
          <.link
            phx-click={JS.push("delete", value: %{id: pool.id}) |> hide("##{id}")}
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
     |> assign(:page_title, "Listing Pools")
     |> stream(:pools, list_pools())}
  end

  @impl true
  def handle_event("delete", %{"id" => id}, socket) do
    pool = Matches.get_pool!(id)
    {:ok, _} = Matches.delete_pool(pool)

    {:noreply, stream_delete(socket, :pools, pool)}
  end

  defp list_pools() do
    Matches.list_pools()
  end
end
